# Technical Spec — Brief 05: Help Me Plan

**Spec status:** Draft — Awaiting owner approval before Writer proceeds.
**Branch:** `feature/help-me-plan` from `staging`
**Depends on:** `feature/scaffold`, `feature/recipe-vault`, `feature/preference-settings` merged to `staging`

---

> **Correction to Spec 04 — Home Screen:**
> Spec 04 computed `week_start` as the most recent **Monday**. Brief 05 establishes
> that **Sunday is canonical** for all `week_start` values. When implementing
> Brief 04 (auth/home screen), the Writer must compute `week_start` as the most
> recent **Sunday** (`getDay() === 0`), not Monday. All week-related queries on
> the home screen should use Sunday-based week starts. Brief 05 takes precedence.

---

## 1. Summary

Build the Help Me Plan flow: a multi-step planning wizard at `/plan` where users
configure their week, receive LLM-generated meal suggestions from their recipe
vault, swap or manually override individual days, and save a confirmed plan. The
LLM is given the user's full recipe vault (filtered by cooldown and preferences)
and returns structured suggestions. The entire flow lives on a single page using
`?step=` query params to control which step is rendered, keeping React state
alive throughout.

---

## 2. DB Changes

### 2a. Add `people_count` to `meal_plans`

```sql
alter table meal_plans
  add column if not exists people_count int default 2;
```

This column is reserved for grocery list scaling (Brief 06). It is not written
during this brief — it exists solely so Brief 06 has no schema migration to make.

### 2b. Enable RLS on `meal_plans` and `meal_plan_entries`

These tables were created in the scaffold but have no RLS yet.

```sql
alter table meal_plans enable row level security;
alter table meal_plan_entries enable row level security;

create policy "owner access meal_plans"
  on meal_plans for all
  using (auth.uid() = user_id);

-- meal_plan_entries are scoped via their parent meal_plan
create policy "owner access meal_plan_entries"
  on meal_plan_entries for all
  using (
    meal_plan_id in (
      select id from meal_plans where user_id = auth.uid()
    )
  );
```

### 2c. Week start convention — Sunday

All `week_start` values stored in `meal_plans` must be the **Sunday** that
begins the week. Compute server-side:

```typescript
function getMostRecentSunday(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay()) // getDay() === 0 for Sunday
  return d.toISOString().split('T')[0]
}
```

### 2d. TypeScript types — add to `types/index.ts`

```typescript
export interface RecipeSuggestion {
  recipe_id:    string
  recipe_title: string
  reason?:      string   // optional LLM explanation, e.g. "Quick weeknight option"
}

export interface DaySuggestions {
  date:    string          // "YYYY-MM-DD"
  options: RecipeSuggestion[]
}

export interface SuggestionsResponse {
  days: DaySuggestions[]
}

export interface DaySelection {
  date:         string
  recipe_id:    string
  recipe_title: string
  from_vault:   boolean  // true = manually picked; show "From vault" label
}

export interface SavedPlanEntry {
  id:            string
  meal_plan_id:  string
  recipe_id:     string
  planned_date:  string
  position:      number
  confirmed:     boolean
}
```

---

## 3. Route Structure

The entire flow lives on one page. The `step` query param controls which UI
is rendered. All state is held in React (`useState`) — refreshing on steps
2 or 3 resets to step 1 (this is acceptable for v1).

| URL | Step rendered |
|---|---|
| `/plan` or `/plan?step=setup` | Step 1 — Plan Setup |
| `/plan?step=suggestions` | Step 2 — Suggestions grid |
| `/plan?step=summary` | Step 3 — Summary & save |

Navigation between steps uses `router.push('/plan?step=<next>')`. The component
tree remains mounted throughout, preserving all React state.

`app/(app)/plan/page.tsx` — `'use client'` page that owns all planning state
and delegates rendering to the appropriate step component based on `?step=`.

---

## 4. Client-Side State

All state lives in `app/(app)/plan/page.tsx` and is passed down as props.

```typescript
// The setup configuration collected in step 1
interface PlanSetup {
  weekStart:        string    // "YYYY-MM-DD" (Sunday)
  activeDates:      string[]  // ISO date strings for planned days
  preferThisWeek:   string[]  // session tag overrides
  avoidThisWeek:    string[]  // session tag overrides
  freeText:         string
  specificRequests: string
}

// The full suggestions state (step 2)
interface SuggestionsState {
  days: {
    date:        string
    options:     RecipeSuggestion[]
    isSwapping:  boolean  // true while a per-day swap is in flight
  }[]
}

// Selections keyed by date. null = user explicitly skipped this day.
// Absent key = not yet selected.
type SelectionsMap = Record<string, DaySelection | null>

// Top-level page state
interface PlanPageState {
  setup:       PlanSetup
  suggestions: SuggestionsState | null
  selections:  SelectionsMap
  isGenerating: boolean   // true while the full LLM call is in flight
}
```

---

## 5. API Routes

All routes require an authenticated Supabase session. Return `401` if none.

---

### `POST /api/plan/suggest`

**Purpose:** Generate meal suggestions for the full week. Primary path is
streaming; fallback is a single JSON response.

**Input:**
```typescript
{
  week_start:        string    // "YYYY-MM-DD" (must be a Sunday)
  active_dates:      string[]  // must be non-empty; all within the specified week
  prefer_this_week:  string[]  // session tag overrides (may be empty)
  avoid_this_week:   string[]  // session tag overrides (may be empty)
  free_text:         string    // may be empty string
  specific_requests: string    // may be empty string
}
```

**Server-side behavior:**
1. Validate `active_dates` is non-empty. Return `400` if not.
2. Validate `week_start` is a Sunday. Return `400` if not.
3. Fetch the user's full recipe list — `main_dish` category only, belonging to
   `auth.uid()`. Join `recipe_history` to find each recipe's most recent
   `made_on`. Exclude any recipe whose most recent `made_on` is within
   `cooldown_days` of today.
4. Fetch user preferences via the `user_preferences` row for `auth.uid()`.
5. Derive the current season from today's server date (see §6).
6. Fetch the user's 10 most recent `recipe_history` entries (recipe title +
   made_on) for recent context.
7. Construct the LLM prompt (see §6).
8. Call the LLM via `lib/llm.ts`.
9. **Streaming path:** return a `Response` with `Content-Type: application/x-ndjson`.
   As each day's result is parsed from the LLM stream, emit one newline-delimited
   JSON line: `{"date":"YYYY-MM-DD","options":[...]}\n`
10. **Non-streaming fallback:** if streaming is unavailable, await the full
    response and return standard JSON: `{ days: DaySuggestions[] }`.
11. Before returning (or emitting each day), validate that every `recipe_id` in
    the LLM response exists in the filtered recipe list provided to the LLM.
    Silently drop any option with an invalid `recipe_id` rather than erroring.

**Error responses:**
- `400` — `active_dates` empty or `week_start` not a Sunday
- `500` — LLM call fails (log server-side, return `{ error: "Suggestion failed. Please try again." }`)

---

### `POST /api/plan/suggest/swap`

**Purpose:** Regenerate suggestions for a single day only.

**Input:**
```typescript
{
  date:             string    // "YYYY-MM-DD" — the day being swapped
  week_start:       string
  already_selected: { date: string, recipe_id: string }[]  // other confirmed days
  prefer_this_week: string[]
  avoid_this_week:  string[]
  free_text:        string
}
```

**Behavior:** Same recipe-fetching and preference-fetching as `POST /api/plan/suggest`,
but constructs the swap prompt (see §6). Returns a **non-streaming** JSON response
(swap is per-row, loading state is localised):

```typescript
{ date: string, options: RecipeSuggestion[] }
```

Validate `recipe_id`s as above. Return `500` on LLM failure.

---

### `POST /api/plan/match`

**Purpose:** Find the closest recipe in the user's vault matching a free-text
query.

**Input:**
```typescript
{ query: string, date: string }
```

**Behavior:**
1. Fetch user's recipe list (all categories, title + tags + id).
2. Pass to LLM with the match prompt (see §6).
3. LLM returns a `recipe_id` if confident, or signals no match.
4. Validate the returned `recipe_id` exists in the fetched list.

**Response:**
```typescript
{ match: { recipe_id: string, recipe_title: string } | null }
```

Always returns `200`. `match: null` means no confident match found.

---

### `POST /api/plan`

**Purpose:** Save the confirmed meal plan.

**Input:**
```typescript
{
  week_start: string   // "YYYY-MM-DD" (Sunday)
  entries: {
    date:      string  // "YYYY-MM-DD"
    recipe_id: string
  }[]
}
```

**Behavior:**
1. Validate `entries` is non-empty. Return `400` if not.
2. Validate `week_start` is a Sunday. Return `400` if not.
3. Upsert `meal_plans` on `(user_id, week_start)` — insert if absent, return
   existing `id` if present.
4. Delete all existing `meal_plan_entries` for that `meal_plan_id`.
5. Insert new `meal_plan_entries` for each entry:
   - `meal_plan_id` — from step 3
   - `recipe_id` — from input
   - `planned_date` — the entry's date
   - `position = 1`
   - `confirmed = true`
6. Return the saved plan.

**Response:**
```typescript
{
  plan_id: string
  entries: SavedPlanEntry[]
}
```

**Errors:** `400` (validation), `500` (DB failure).

---

### `GET /api/plan?week_start=YYYY-MM-DD`

**Purpose:** Fetch an existing saved plan for a given week.

**Behavior:** Look up `meal_plans` for `(auth.uid(), week_start)`. If found,
join `meal_plan_entries` and `recipes` (for title). Return the plan with
enriched entries. If not found, return `{ plan: null }`.

**Response:**
```typescript
{
  plan: {
    id:         string
    week_start: string
    entries: {
      planned_date:  string
      recipe_id:     string
      recipe_title:  string
      position:      number
      confirmed:     boolean
    }[]
  } | null
}
```

---

## 6. LLM Integration

### Season derivation (server-side)

```typescript
function getSeason(month: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'   // Dec, Jan, Feb
}
// month is 0-indexed (Date.getMonth())
```

### Full-week suggestion prompt

The prompt is a system + user message pair sent to `lib/llm.ts`.

**System message** (set expectations and output format):
```
You are a meal planning assistant. You will be given a list of recipes and
user preferences, and you must suggest meals for specific days of the week.

Rules you must follow exactly:
- Only suggest recipes from the provided recipe list. Never invent recipes.
- Only use recipe_ids from the provided list. Never guess or modify ids.
- Return exactly {options_per_day} options per day.
- Never suggest the same recipe for more than one day.
- Never suggest recipes with avoided tags: {avoided_tags_combined}.
- Prefer recipes with preferred tags: {preferred_tags_combined}.
- Respect weekly tag caps: {limited_tags_summary}.
  e.g. if "Comfort" cap is 2, the total options across all days with the
  "Comfort" tag must not exceed 2.
- Current season is {season}. {seasonal_instructions}
- Variety matters: spread different recipe types across the week.

Return ONLY valid JSON in this exact format, with no prose, no markdown:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "options": [
        {
          "recipe_id": "uuid",
          "recipe_title": "Recipe Name",
          "reason": "One-line reason, e.g. Quick weeknight option"
        }
      ]
    }
  ]
}
```

**User message** (the actual request):
```
Plan meals for these dates: {active_dates_list}

Available recipes (main dish only, cooldown-filtered):
{recipe_list_json}
  // array of { id, title, tags }

Recent meal history (avoid repeating recent meals):
{recent_history_json}
  // array of { title, made_on }

User context for this week:
{free_text}

Specific requests (best-effort):
{specific_requests}
```

**Constructing `avoided_tags_combined`:** merge `user.avoided_tags` and
`session.avoid_this_week`, deduplicate.

**Constructing `preferred_tags_combined`:** merge `user.preferred_tags` and
`session.prefer_this_week`, deduplicate.

**Constructing `limited_tags_summary`:** format `limited_tags` as a readable
list, e.g. `"Comfort: max 2/week, Soup: max 2/week"`.

**Constructing `seasonal_instructions`:** if `seasonal_mode` is on and the
current season has rules in `user.seasonal_rules`, render them as plain
English, e.g. `"Favor Grill recipes. Cap Grill at 2 total across the week."`.
If `seasonal_mode` is off or no rules exist for the current season, omit
this sentence.

### Swap prompt

Sent to `lib/llm.ts` for `POST /api/plan/suggest/swap`.

Same system message as above, with these changes in the user message:
- `active_dates_list` is just the single swap date
- Add: `"Recipes already selected for other days (do not repeat these): {already_selected_titles}"`
- Instruction: `"Return suggestions for {date} only."`

### Free-text match prompt

Sent to `lib/llm.ts` for `POST /api/plan/match`. Short and focused.

**System message:**
```
You are helping find a recipe from a user's personal recipe vault.
Given a search phrase and a list of recipes, return the recipe_id of the
best match, or null if there is no confident match.
Return ONLY valid JSON: { "recipe_id": "uuid" } or { "recipe_id": null }
```

**User message:**
```
Search phrase: "{query}"
Recipes: {recipe_list_json}
  // array of { id, title, tags }
```

### Streaming implementation

`POST /api/plan/suggest` should detect whether `lib/llm.ts` supports streaming.
If yes:
- Use a `TransformStream` to parse the LLM output incrementally.
- When a complete day JSON object is detected in the stream (the LLM is
  prompted to output one day at a time within the `days` array), emit it
  as an NDJSON line: `JSON.stringify(dayObject) + '\n'`.
- Set response headers: `Content-Type: application/x-ndjson`,
  `Transfer-Encoding: chunked`, `X-Content-Type-Options: nosniff`.

If streaming is not supported (or fails), fall back to awaiting the full
response and returning `Content-Type: application/json` with the complete
`{ days }` object.

The client must handle both response types:
- Detect by checking `response.headers.get('content-type')`.
- NDJSON path: read the `ReadableStream`, split on `\n`, parse each line.
- JSON path: `await response.json()`.

---

## 7. UI Components

All TypeScript. All Tailwind — no inline styles, no external CSS.

---

### `app/(app)/plan/page.tsx`

`'use client'`. Owns all `PlanPageState`. Reads `?step=` from
`useSearchParams()`. Renders the appropriate step component and passes state +
updater callbacks as props. Initialises `setup.weekStart` to the most recent
Sunday on mount.

Step routing:
- No `step` param or `step=setup` → render `<SetupStep />`
- `step=suggestions` → render `<SuggestionsStep />` (redirect to setup if
  `suggestions` is null — handles accidental direct navigation)
- `step=summary` → render `<SummaryStep />` (redirect to setup if no
  selections exist)

---

### `components/plan/WeekPicker.tsx`

Props: `weekStart: string`, `onChange: (weekStart: string) => void`

- Displays the week range: `"Mar 1 – Mar 7"` (Sunday to Saturday).
- Left arrow: navigate to previous week. Disabled if `weekStart` is the
  current week's Sunday (cannot go to the past).
- Right arrow: navigate to next week. Disabled if `weekStart` is 4 weeks
  ahead of the current week's Sunday.
- On arrow click: compute new `weekStart` (± 7 days), call `onChange`.

---

### `components/plan/DayTogglePicker.tsx`

Props: `activeDates: string[]`, `weekStart: string`,
`onChange: (activeDates: string[]) => void`

- Renders 7 pill buttons: Mon Tue Wed Thu Fri Sat Sun.
- Active days: filled/coloured. Inactive: greyed out.
- Tap to toggle. Cannot deactivate the last active day — if only 1 remains,
  all 7 pills are rendered but the sole active one is non-interactive (no
  cursor-pointer, no toggle on click). Show a helper: `"At least 1 day required"`.
- Computes the 7 dates from `weekStart` and passes the full set of active
  `Date` strings back via `onChange`.

---

### `components/plan/SetupStep.tsx`

Props: `setup: PlanSetup`, `onSetupChange`, `onGetSuggestions: () => void`,
`isGenerating: boolean`

Renders:
1. `<WeekPicker />` — week selection
2. `<DayTogglePicker />` — day exclusions (label: "Which days are you planning?")
3. **Free text context** — `<textarea>` max 300 chars with live character counter
   (`text-stone-400 text-xs`, e.g. `"247/300"`)
4. **Tag overrides** — two `<TagBucketPicker />` instances (reuse from
   `components/preferences/TagBucketPicker.tsx`):
   - "Prefer this week" — bucket=`'preferred'`, available = user's full tag library
   - "Avoid this week" — bucket=`'avoided'`, available = tags not in "prefer" override
5. **Specific requests** — `<textarea>` max 300 chars with character counter.
   Helper text below: `"We'll do our best to match these — swap if needed after."`
6. **"Get Suggestions" button** — primary, full-width on mobile.
   - Disabled when `activeDates` is empty or `isGenerating` is true.
   - Loading state: replace label with `"Finding your meals…"` + spinner.
   - On click: call `onGetSuggestions()`.

On mount: load the user's tag library from `GET /api/tags` for the tag pickers.

---

### `components/plan/SuggestionsStep.tsx`

Props: `setup: PlanSetup`, `suggestions: SuggestionsState`,
`selections: SelectionsMap`, `onSelect`, `onSkipDay`, `onSwapDay`,
`onAssignToDay`, `onVaultPick`, `onFreeTextMatch`, `onRegenerate`,
`onConfirm: () => void`

**Top bar:**
- Week label: `"Suggestions for Mar 1 – Mar 7"`
- "Regenerate" button (secondary) — on click, if the user has any existing
  selections, show a small inline confirmation with two options:
  - "Regenerate all days" — clears all selections and regenerates everything
  - "Regenerate unselected days only" — keeps existing selections, only
    generates new options for days without a selection
  If no selections exist yet, skip the prompt and regenerate all immediately
- "Confirm Plan" button (primary) — disabled unless at least 1 day has a
  non-null selection. Calls `onConfirm`.

**Day rows** — one `<SuggestionDayRow />` per date in `setup.activeDates`,
ordered chronologically.

---

### `components/plan/SuggestionDayRow.tsx`

Props: `date: string`, `options: RecipeSuggestion[]`, `selection: DaySelection | null | undefined`,
`isSwapping: boolean`, `activeDates: string[]`, `onSelect`, `onSkip`,
`onSwap`, `onAssignToDay`, `onVaultPick`, `onFreeTextMatch`

**Layout (one row):**

```
Monday Mar 2                              [Swap]  [Skip this day]
┌─────────────────────────────────────────────────────┐
│ Option 1: Lemon Herb Chicken           [Select]      │
│ Quick · Healthy                                      │
│ "Great weeknight option"                             │
│                           [Use for a different day]  │
├─────────────────────────────────────────────────────┤
│ Option 2: ...                                        │
└─────────────────────────────────────────────────────┘
[Pick from my vault]   [Something else in mind? ▾]
```

- While `isSwapping`: replace the options area with a skeleton loading state
  (e.g. 2–3 grey rounded rectangles with a pulse animation).
- **Selection state:** selected option gets a highlighted border
  (`border-emerald-600 bg-emerald-50`). Other options dimmed
  (`opacity-60`). A checkmark icon replaces the Select button.
- **"Skip this day"**: sets `selection = null` for this date. Once skipped,
  render a single muted row: `"Skipping this day"` + an "Undo" link.
- **"Use for a different day"**: opens `<AssignDayPicker />` (inline popover or
  bottom sheet) showing `activeDates` minus the current day. Selecting a target
  day calls `onAssignToDay(recipe, targetDate)`. The source day's options are
  unaffected.
- **"Pick from my vault"**: opens `<VaultSearchSheet />` for this date.
- **"Something else in mind?"**: collapsed `<input>` (text) that expands on
  click. On form submit (Enter or button): calls `onFreeTextMatch(query, date)`.
  Show inline loading state while `POST /api/plan/match` is in flight.
  - Match found: assign recipe, show "From vault" label on the assigned card.
  - No match: show `"Couldn't find that in your vault — try searching"` inline
    and open `<VaultSearchSheet />`.
- **"From vault" label**: shown on any `DaySelection` where `from_vault = true`.
  Render as a small muted badge: `"From vault"` in `text-stone-400`.
- **`reason` field**: if present on a `RecipeSuggestion`, render below the
  recipe name in `text-sm text-stone-400 italic`.

---

### `components/plan/AssignDayPicker.tsx`

Props: `activeDates: string[]`, `excludeDate: string`,
`onSelect: (targetDate: string) => void`, `onClose: () => void`

Simple popover or bottom sheet (bottom sheet on mobile, floating card on desktop).
Lists active dates (excluding the source date) as selectable rows. One tap assigns
and closes.

---

### `components/plan/VaultSearchSheet.tsx`

Props: `forDate: string`, `onAssign: (recipe: DaySelection) => void`,
`onClose: () => void`

Bottom sheet on mobile, modal on desktop (`max-w-lg`).

- **Search input** — filters by recipe title (client-side, case-insensitive)
- **Tag dropdown** — filter by tag (from user's tag library)
- **Category dropdown** — filter by category
- **Recipe list** — scrollable; each row shows title + tags. Tap to assign.
  On assign: calls `onAssign` with `from_vault = true`, closes sheet.
- Loads full recipe list from `GET /api/recipes` on mount (once, cached in
  component state for the session).

---

### `components/plan/SummaryStep.tsx`

Props: `setup: PlanSetup`, `selections: SelectionsMap`,
`onSave: () => Promise<void>`, `isSaving: boolean`, `onBack: () => void`

**Renders:**
- Heading: `"Your plan for Mar 1 – Mar 7"`
- **Confirmed days** (days with a non-null selection, sorted chronologically):
  `"Monday Mar 2 — Lemon Herb Chicken"`
- **Skipped days** (days with `selection = null`):
  `"Skipping: Tuesday, Thursday"` (comma-separated, muted text)
- **Excluded days** (days not in `setup.activeDates`): not shown at all
- **"Looks good — save my plan"** button (primary, full-width on mobile).
  Shows spinner + `"Saving…"` while `isSaving`. Disabled while saving.
- **"Go back"** link — calls `onBack()` (which pushes `?step=suggestions`).
  Selections are preserved in React state.
- **Inline error** below the save button if `POST /api/plan` fails:
  `"Something went wrong. Please try again."` in `text-red-600`.

---

### `components/plan/PostSaveModal.tsx`

Props: `weekStart: string`, `isOpen: boolean`

No dismiss/close mechanism — user must choose an action.

```
┌────────────────────────────────────┐
│  Plan saved!                       │
│                                    │
│  What would you like to do next?   │
│                                    │
│  [Make my grocery list]            │
│  [Go to home]                      │
└────────────────────────────────────┘
```

- Title: `"Plan saved!"` in `text-emerald-700 font-semibold`
- "Make my grocery list" → `router.push('/groceries?week_start=' + weekStart)`
- "Go to home" → `router.push('/home')`
- Modal overlay: `fixed inset-0 bg-black/40 flex items-center justify-center`

---

## 8. Business Logic

1. **Week start is always Sunday.** Compute via `date.getDay() === 0`.
   The `WeekPicker` component navigates in 7-day increments from the current
   Sunday. Store and transmit `week_start` only as a Sunday ISO date string.

2. **Past weeks are disabled.** The minimum selectable `week_start` is the
   current week's Sunday. If today is mid-week, the current week is still
   valid. Disable the left arrow when `weekStart === currentSunday`.

3. **4-week future cap.** The maximum selectable `week_start` is 4 Sundays
   ahead of the current Sunday. Disable the right arrow at this boundary.

4. **At least 1 day must remain active.** The `DayTogglePicker` prevents
   toggling off the last active day. The "Get Suggestions" button is also
   disabled when `activeDates.length === 0` as a fallback guard.

5. **Cooldown filtering happens server-side, before the LLM call.** The Writer
   must not rely on the LLM to exclude cooldown recipes. Filter in the DB query:
   join `recipe_history`, find max `made_on` per recipe, exclude any recipe
   where `max(made_on) >= today - cooldown_days`.

6. **LLM response validation.** After receiving the LLM response (streaming or
   not), validate that every `recipe_id` in the returned options exists in the
   recipe list sent to the LLM. Drop invalid options silently rather than
   erroring — a partial result is better than a failure. If an entire day ends
   up with zero valid options after filtering, include it in the response with
   `options: []`. The client must handle empty options gracefully (show a "No
   suggestions — try swapping" message for that day).

7. **Tag caps are per week, across all days.** The prompt instructs the LLM to
   respect caps. The server does not validate caps in the response — this is the
   LLM's responsibility as directed by the prompt.

8. **Cross-day assignment does not modify the source day.** When a user assigns
   Option 2 from Monday to Tuesday, Monday's options array is untouched. Monday's
   current selection (if any) is also untouched. Tuesday's existing selection is
   replaced with the newly assigned recipe (`from_vault = false`).

9. **Upsert plan replaces all entries.** `POST /api/plan` deletes all existing
   `meal_plan_entries` for the matching `meal_plans` row before inserting new ones.
   This means re-saving a plan for the same week is a full replacement.

10. **"Confirm Plan" requires at least 1 selection.** A selection is a
    `DaySelection` (not null, not undefined). Days where `selections[date] === null`
    are skipped, not confirmed. Days where `selections[date] === undefined` are
    also not confirmed. The `POST /api/plan` payload only includes entries with
    a defined, non-null `DaySelection`.

11. **Session tag overrides merge with, not replace, account preferences.**
    `prefer_this_week` is unioned with `preferred_tags` in the prompt.
    `avoid_this_week` is unioned with `avoided_tags` in the prompt. Neither
    replaces the account-level settings — they only add to them for this session.
    A tag in `prefer_this_week` takes priority even if it is in `limited_tags`.

12. **`POST /api/plan/match` only searches the authenticated user's own recipes.**
    Shared recipes from other users are not included in the match search.

---

## 9. Test Cases

| # | Test case |
|---|---|
| T01 | Setup screen defaults to current week's Sunday as `week_start` |
| T02 | Week navigation forward and backward changes the week range display correctly |
| T03 | Left arrow is disabled on the current week (cannot go to past weeks) |
| T04 | Right arrow is disabled when 4 weeks ahead of the current week |
| T05 | Toggling a day off removes it from `activeDates` |
| T06 | Cannot deactivate the last active day (toggle becomes non-interactive) |
| T07 | "Get Suggestions" button is disabled when no days are active |
| T08 | LLM returns exactly `options_per_day` options for each day |
| T09 | All `recipe_id`s in the LLM response exist in the user's recipe vault |
| T10 | Cooldown recipes are excluded from the recipe list sent to the LLM |
| T11 | Avoided tags (account-level + session) are not present in any suggestion |
| T12 | Limited tag cap is not exceeded across the week's suggestions |
| T13 | "Swap" on a day re-fetches only that day; other days are unchanged |
| T14 | While a day is swapping, a skeleton loading state is shown for that row only |
| T15 | "Regenerate" with no existing selections regenerates all days immediately |
| T15b | "Regenerate" with existing selections shows a prompt with two options |
| T15c | "Regenerate all days" clears selections and replaces all suggestions |
| T15d | "Regenerate unselected days only" preserves existing selections and only replaces unselected days |
| T16 | Selecting an option highlights it and dims the others on that day |
| T17 | A suggestion from Day A can be assigned to Day B via "Use for a different day" |
| T18 | Cross-day assignment replaces Day B's existing selection |
| T19 | Cross-day assignment leaves Day A's options and selection unchanged |
| T20 | "Pick from my vault" opens the search sheet; selecting a recipe assigns it with "From vault" label |
| T21 | "Something else in mind?" free text finds a matching recipe and assigns it |
| T22 | Free text with no match shows the "Couldn't find that" message and opens vault search |
| T23 | "Skip this day" marks a day as skipped; "Undo" restores it to unselected |
| T24 | "Confirm Plan" is disabled with zero selections; enabled with 1 or more |
| T25 | Clicking "Confirm Plan" advances to summary step with all selections intact |
| T26 | Summary shows confirmed days and recipe names in chronological order |
| T27 | Summary shows skipped days in the "Skipping:" line |
| T28 | Excluded days (toggled off at setup) do not appear in the summary |
| T29 | "Go back" from summary returns to suggestions step with all selections intact |
| T30 | Saving the plan upserts correctly (replaces existing plan for the same week) |
| T31 | Post-save modal appears after a successful save; no dismiss option |
| T32 | "Make my grocery list" button navigates to `/groceries?week_start=YYYY-MM-DD` |
| T33 | "Go to home" button navigates to `/home` |
| T34 | `GET /api/plan?week_start=` returns the saved plan with enriched entries |
| T35 | `GET /api/plan?week_start=` returns `{ plan: null }` when no plan exists |
| T36 | Saved plan appears in the `/home` "This Week" section |
| T37 | Navigating directly to `?step=suggestions` with no suggestions redirects to setup |

---

## 10. Out of Scope

- Grocery list generation (Brief 06)
- Calendar integration (Apple/Google Calendar)
- Multi-week planning
- Number of people per meal (Brief 06)
- Breakfast, dessert, and side dish planning (main dish only in v1)
- Drag-and-drop reordering of days
- Saving session preferences as a template
- Sharing a plan with other Forkcast users

---

*Awaiting owner approval before Writer proceeds.*
