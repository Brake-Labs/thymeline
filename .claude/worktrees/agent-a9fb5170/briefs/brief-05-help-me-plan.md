# Brief 05 — Help Me Plan

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/help-me-plan`
**Target:** PR into `staging`
**Depends on:** Brief 01 (scaffold), Brief 02 (recipe vault), Brief 03 (preferences) merged to staging

---

## User Story
As a Forkcast user, I want to tell the app what my week looks like, get
AI-suggested meals for each day based on my preferences and recipe vault,
swap out anything I don't like, and confirm my plan — so I can go into
the week knowing what I'm cooking without having to think too hard about it.

---

## The Flow (end to end)

```
1. User opens Help Me Plan (/plan)
2. User sets up the week (date range, exclusions, session preferences)
3. User clicks "Get Suggestions"
4. LLM generates meal options for each active day
5. User reviews options, swaps individual days or regenerates all
6. User confirms selections (can skip individual days)
7. Summary screen shown before saving
8. Plan saved to meal_plans + meal_plan_entries
9. User redirected to /home (plan now visible in "This Week")
```

---

## Screen 1 — Plan Setup (`/plan`)

The setup screen collects everything the LLM needs before generating.

### Week Picker
- Default: the current week (Sun–Sat)
- User can navigate forward/backward by week using arrow buttons
- Display the week range: "Mar 3 – Mar 9"
- Cannot plan more than 4 weeks in the future
- Cannot plan in the past (weeks before current week are disabled)

### Day Exclusions
- All 7 days shown as toggleable pills (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- Default: all days active
- Tapping a day toggles it off (greyed out) = "not planning this day"
- At least 1 day must remain active — cannot deactivate all days

### Session Preferences
Four inputs, all optional:

**1. Free text context**
- Label: "Anything on your mind this week?"
- Placeholder: "e.g. I'm feeling Italian, keep it quick, we have lots of chicken to use up"
- Single text area, max 300 characters
- Character counter shown

**2. Tag overrides for this week**
- Two tag pickers (same pill-toggle style as preferences UI):
  - "Prefer this week" — multi-select from user's tag library
  - "Avoid this week" — multi-select from user's tag library
- These override (not replace) the user's account-level preferences for
  this session only
- A tag can be in one override bucket or the other, not both

**3. Nights eating out / skipping**
- Same day pills as the exclusion row but labeled "Eating out or skipping"
- Selecting a day here removes it from the plan entirely (same as exclusion)
- Merge these with the exclusion toggles in the UI — one row of day pills
  with a clear label, one tap = excluded

**4. Specific recipe requests**
- Label: "Any specific requests?"
- Placeholder: "e.g. tacos on Friday, the lemon chicken on Wednesday"
- Free text, max 300 characters
- The LLM will try to honor these — but this is a best-effort hint, not
  a hard constraint. Make this clear with helper text:
  "We'll do our best to match these — swap if needed after."

### "Get Suggestions" button
- Primary CTA, full width on mobile
- Disabled until at least 1 day is active
- Shows a loading state while the LLM runs: "Finding your meals…"
- LLM call should stream if possible — show a skeleton loading state
  per day slot that fills in as each day's suggestions arrive

---

## Screen 2 — Suggestions (`/plan/suggestions`)

Shown after the LLM returns results. Full week grid of suggestions.

### Layout
- One row per active day
- Each row shows:
  - Day label + date (e.g. "Monday Mar 3")
  - Recipe options (number based on user's `options_per_day` preference)
  - Each option: recipe name + tags as pills
  - A "Select" button or tap-to-select interaction per option
  - A "Swap" button per day — regenerates just that day's options
  - A "Skip this day" link per day — removes it from the plan

### Selection behavior
- User can select one option per day (or skip the day)
- Selected option is highlighted
- Unselected options remain visible but dimmed
- User does not need to select all days before confirming — partial
  confirmation is allowed

### Cross-day assignment
- Any suggestion card from any day can be assigned to any other day
- Each suggestion card has a small "Use for a different day" button (secondary,
  subtle — not the primary interaction)
- Tapping it opens a simple day picker showing the active days for the week
- Selecting a day assigns that recipe to that day, replacing any existing
  selection for that day
- The original day the suggestion came from is unaffected — its options remain
  visible and selectable
- This means a user can use two of Monday's suggestions: one for Monday,
  one for Tuesday (or any other day)

### Manual recipe pick (vault search)
- Each day row has a "Pick from my vault" link below the LLM suggestions
- Tapping it opens a search/filter sheet (bottom sheet on mobile, modal on desktop)
- User can search by recipe name or filter by tag/category
- Selecting a recipe from the vault assigns it to that day, replacing any
  existing selection
- The manually picked recipe appears in the day row with a "From vault" label
  so it's visually distinct from LLM suggestions
- A manually picked recipe can be cleared (returns day to unselected state)

### Free text inspiration
- Each day row also has a small "Something else in mind?" text input
  (collapsed by default, expands on tap)
- User can type a recipe name or description (e.g. "tacos", "that lemon chicken")
- On submit, this calls a lightweight LLM lookup: find the closest matching
  recipe in the user's vault and assign it to that day
- If no match is found: show a message "Couldn't find that in your vault —
  try searching" and open the vault search sheet
- If a match is found: assign it and show the recipe name with a "From vault" label

### Top actions
- "Regenerate all" button — reruns the full LLM call with the same
  session preferences, replaces all current suggestions
- "Confirm Plan" button — advances to the summary screen
  - Enabled as long as at least 1 day has a selection

### Swap behavior (individual day)
- Clicking "Swap" on a day calls the LLM for just that day
- Shows a loading state on that day's row only
- Returns a new set of options for that day (same count as `options_per_day`)
- The swapped options replace the previous ones for that day
- Previously selected option for that day is cleared

---

## Screen 3 — Summary (`/plan/summary`)

Shown after user clicks "Confirm Plan." A review screen before saving.

### Displays
- Week range: "Your plan for Mar 3 – Mar 9"
- List of confirmed days: day label + selected recipe name
- Skipped days listed separately: "Skipping: Tuesday, Thursday"
- Unplanned days (user excluded at setup): not shown
- "Looks good — save my plan" button (primary)
- "Go back" link — returns to suggestions screen with selections intact

### On save
- Call `POST /api/plan` with the confirmed selections
- If a plan already exists for this week: replace it (upsert behavior)
- On success: show a modal dialog (see below)
- On error: show inline error, stay on summary screen

### Post-save modal
After a successful save, show a modal dialog overlaying the summary screen:

- Title: "Plan saved! 🎉"
- Body: "What would you like to do next?"
- Primary button: "Make my grocery list" → navigates to `/groceries?week_start=YYYY-MM-DD`
- Secondary button: "Go to home" → navigates to `/home`
- No close/dismiss option — user must choose one
- The modal should feel celebratory but not over the top — a subtle
  success color (emerald) on the title, clean and simple otherwise

---

## LLM Integration

### What the LLM receives
The planning engine sends a structured prompt to the LLM via `lib/llm.ts`.

**Context passed in:**
- The user's full recipe list (id, title, tags, category) — filtered to
  main_dish only, excluding recipes made within `cooldown_days`
- User's account-level preferences (preferred_tags, avoided_tags,
  limited_tags with caps, seasonal_mode, options_per_day)
- Session overrides (prefer_this_week, avoid_this_week, free_text,
  specific_requests)
- Active days being planned
- Current season (derived from current month server-side)
- Recent recipe history (last 10 made_on entries with recipe titles)
  so the LLM understands what's been eaten recently

**What the LLM returns:**
Structured JSON — one entry per day, each with an array of recipe options:

```typescript
{
  days: {
    date: string          // "YYYY-MM-DD"
    options: {
      recipe_id: string
      recipe_title: string
      reason?: string     // optional one-line explanation e.g. "Quick weeknight option"
    }[]
  }[]
}
```

The LLM must only return recipe_ids that exist in the provided recipe list.
The prompt must make this explicit.

### Prompt construction rules
The planning prompt must enforce (instruct the LLM to follow):
- Cooldown: don't suggest recipes made within `cooldown_days` (already
  filtered from the list before sending, so the LLM just picks from what's given)
- Tag caps: respect `limited_tags` weekly caps across the full week
- Avoided tags: never suggest recipes with avoided tags (for both account-level
  and session-level avoided tags)
- Preferred tags: bias toward these
- Seasonal rules: if `seasonal_mode` is on, apply current season rules
- Specific requests: try to honor `specific_requests` free text
- Variety: don't repeat the same recipe across days
- `options_per_day`: return exactly this many options per day

### Swap prompt
When swapping a single day, send a reduced prompt with:
- The same recipe list and preferences
- The specific date being swapped
- The recipes already selected for other days (so the LLM avoids repeats)
- A note that this is a swap — return only 1 day's worth of options

### Streaming
- Use streaming LLM responses if any-llm supports it
- Parse the stream progressively — as each day's options arrive, render
  them into the suggestions grid
- If streaming is not available, fall back to a single response with a
  full-page loading state

---

## API Routes

### `POST /api/plan/suggest`

**Purpose:** Generate meal suggestions for the week.

**Input:**
```typescript
{
  week_start:       string      // "YYYY-MM-DD" (Monday)
  active_dates:     string[]    // dates to plan for
  prefer_this_week: string[]    // tag overrides
  avoid_this_week:  string[]    // tag overrides
  free_text:        string      // context
  specific_requests: string     // recipe requests
}
```

**Behavior:**
1. Fetch user's recipes (main_dish only, exclude cooldown)
2. Fetch user's preferences
3. Construct LLM prompt
4. Call LLM via `lib/llm.ts`
5. Validate response — every recipe_id must exist in the user's recipe list
6. Return structured suggestions

**Response:** `{ days: { date, options: { recipe_id, recipe_title, reason? }[] }[] }`

**Errors:**
- `400` — no active_dates provided
- `500` — LLM call fails (return generic message, log error)

---

### `POST /api/plan/suggest/swap`

**Purpose:** Regenerate suggestions for a single day.

**Input:**
```typescript
{
  date:              string     // the day being swapped
  week_start:        string
  already_selected:  { date: string, recipe_id: string }[]  // other confirmed days
  prefer_this_week:  string[]
  avoid_this_week:   string[]
  free_text:         string
}
```

**Response:** `{ date: string, options: { recipe_id, recipe_title, reason? }[] }`

---

### `POST /api/plan/match`

**Purpose:** Find the closest matching recipe in the user's vault from a
free text description.

**Input:**
```typescript
{
  query: string     // e.g. "tacos", "that lemon chicken dish"
  date:  string     // the day this is being assigned to (for context)
}
```

**Behavior:**
1. Fetch user's recipe list (title + tags)
2. Pass to LLM with a short prompt: find the best match for the query
3. If confident match found: return the recipe
4. If no confident match: return `{ match: null }`

**Response:**
```typescript
{ match: { recipe_id: string, recipe_title: string } | null }
```

---

### `POST /api/plan`

**Purpose:** Save the confirmed meal plan.

**Input:**
```typescript
{
  week_start: string
  entries: {
    date:      string
    recipe_id: string
  }[]
}
```

**Behavior:**
1. Upsert `meal_plans` row for `(user_id, week_start)`
2. Delete existing `meal_plan_entries` for this plan
3. Insert new entries with `confirmed = true`, `position = 1`
4. Return the saved plan

**Response:** `{ plan_id: string, entries: MealPlanEntry[] }`

---

### `GET /api/plan?week_start=YYYY-MM-DD`

**Purpose:** Fetch an existing plan for a given week.

**Response:** Same shape as `POST /api/plan` response, or `{ plan: null }` if none exists.

---

## DB Changes

No new tables needed — `meal_plans` and `meal_plan_entries` already exist
from the scaffold. One small addition:

```sql
-- Add people_count to meal_plans for grocery list scaling (set during grocery list generation)
alter table meal_plans
  add column if not exists people_count int default 2;
```

---

## UI Notes
- The setup screen should feel like a quick conversation, not a form —
  generous spacing, friendly labels, nothing clinical
- The suggestions grid is the most important screen — it needs to be
  fast to scan and easy to interact with on mobile
- Recipe names in suggestions should be full and readable — don't truncate
- Tag pills on suggestion options should be small and muted — supporting
  info, not the focus
- The "reason" field from the LLM (e.g. "Quick weeknight option") should
  be shown subtly below the recipe name if present — small, muted text
- Loading states matter here more than anywhere else in the app — the LLM
  call takes a few seconds. Make it feel intentional, not broken.

---

## Out of Scope
- Grocery list generation (Brief 06)
- Calendar integration (Apple/Google Calendar) — future feature
  **Note for future:** Calendar integration could detect guest dinners,
  eating-out nights, and busy nights automatically. Worth building once
  the core planning flow is stable.
- Multi-week planning
- Number of people per meal — collected during grocery list generation (Brief 06),
  not during planning. The meal_plans table has a people_count column ready for it.
- Breakfast/dessert/side dish planning (main dish only in v1)
- Drag-and-drop reordering of days
- Saving session preferences as a template
- Sharing your plan with other Forkcast users

---

## Test Cases
- [ ] Setup screen defaults to current week Sun–Sat
- [ ] Week navigation forward/backward works correctly
- [ ] Cannot navigate to past weeks
- [ ] Cannot navigate more than 4 weeks ahead
- [ ] Toggling a day off removes it from active_dates
- [ ] Cannot deactivate all days (last active day cannot be toggled off)
- [ ] "Get Suggestions" is disabled when no days are active
- [ ] LLM returns correct number of options per day (matches options_per_day)
- [ ] All returned recipe_ids exist in the user's recipe vault
- [ ] Cooldown recipes are not suggested (excluded before LLM call)
- [ ] Avoided tags (account + session) are never suggested
- [ ] Limited tag caps are respected across the week
- [ ] "Swap" regenerates only that day's options, preserving others
- [ ] "Regenerate all" replaces all suggestions
- [ ] User can select one option per day
- [ ] A suggestion from one day can be assigned to a different day via "Use for a different day"
- [ ] Cross-day assignment replaces the existing selection on the target day
- [ ] "Pick from my vault" opens search sheet and assigns selected recipe to that day
- [ ] Manually picked recipe shows "From vault" label
- [ ] "Something else in mind?" free text matches a recipe and assigns it
- [ ] Free text with no match shows "Couldn't find that" message and opens vault search
- [ ] User can skip individual days on the suggestions screen
- [ ] "Confirm Plan" is enabled with at least 1 selection
- [ ] Summary screen shows confirmed days and skipped days correctly
- [ ] "Go back" from summary returns to suggestions with selections intact
- [ ] Saving plan upserts correctly (replaces existing plan for same week)
- [ ] Post-save modal appears after successful save
- [ ] "Make my grocery list" button navigates to /groceries with correct week_start param
- [ ] "Go to home" button navigates to /home
- [ ] `GET /api/plan?week_start=` returns existing plan or null
- [ ] Saved plan appears on /home "This Week" section

---

## How to Hand This to the Architect

Paste this entire brief into your Forkcast Architect session in AOE with
this message prepended:

> "You are the Forkcast Architect agent. Read CLAUDE.md in the root of
> this repo for your full instructions. Then read
> briefs/brief-05-help-me-plan.md and produce a full technical spec for
> the Writer agent to implement. Ask me if anything is ambiguous before
> writing the spec."
