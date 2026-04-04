# Brief 03 — Preference Settings UI

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/preference-settings`
**Target:** PR into `staging`
**Depends on:** Brief 01 (scaffold) merged to staging

---

## User Story
As a new Forkcast user, I want to set my meal planning preferences during
onboarding so Forkcast knows how to suggest meals for me. As an existing user,
I want to be able to update those preferences anytime from a settings page.

---

## Mental Model for Preferences

Tags are split into three buckets per user:

- **Preferred tags** — recipes with these tags get surfaced first (e.g. Healthy, Quick)
- **Limited tags** — recipes with these tags are allowed but capped per week
  (e.g. Comfort — limit to 2/week). Each limited tag has a numeric cap the user sets.
- **Avoided tags** — recipes with these tags are never suggested (e.g. Spicy)

A tag can only be in one bucket at a time. Moving a tag to a different bucket
removes it from the previous one.

---

## Two Entry Points

### Entry Point A — Onboarding Flow
Shown once, immediately after a user creates their account. A focused
step-by-step flow covering 4 questions:

**Step 1 — How many meal options do you want each day?**
- Stepper UI: minus button / number / plus button
- Range: 1–5
- Default: 3
- Label: "Options per day"
- Helper text: "We'll show you this many recipe choices for each day you're planning."

**Step 2 — How soon can a recipe repeat?**
- Slider: 1–60 days
- Default: 28 days
- Show current value as a label that updates live: "28 days" / "2 weeks" / "1 month"
- Helper text: "We won't suggest a recipe you've made more recently than this."
- Display friendly labels at key points:
  - 7 = "1 week"
  - 14 = "2 weeks"
  - 28 = "1 month"
  - 60 = "2 months"
  - Other values = "X days"

**Step 3 — What kinds of meals do you prefer?**
- Multi-select tag picker showing the user's full tag library
- Selected tags go into the **Preferred** bucket
- Helper text: "We'll prioritize these when suggesting meals."
- Pre-selected defaults for new accounts: none (let the user choose fresh)

**Step 4 — Any tags to limit or avoid?**
- Two sub-sections on one screen:
  - **Limit** — multi-select from remaining tags (not already Preferred);
    for each selected tag, show a small inline stepper to set the weekly cap
    (range 1–7, default 2)
  - **Avoid** — multi-select from remaining tags (not already Preferred or Limited)
- Helper text for Limit: "These can appear in your plan, but only up to a set number per week."
- Helper text for Avoid: "We'll never suggest recipes with these tags."

**Onboarding navigation:**
- Progress indicator showing Step X of 4
- "Next" button advances; "Back" button goes to previous step
- "Skip for now" link on every step — skips to the app with defaults saved
- Final step has "Done" button instead of "Next" — saves all preferences and
  redirects to `/recipes`
- Do not save partial preferences on Back — only save on "Done" or "Skip"

---

### Entry Point B — Settings Page
Route: `/settings/preferences`

Same preference options as onboarding but displayed as a single scrollable
page with clearly labeled sections. Each section has its own **Save** button
that saves only that section independently.

**Sections:**

**Section 1 — Planning Defaults**
- Options per day (same stepper as onboarding)
- Cooldown days (same slider as onboarding)
- Save button: "Save"

**Section 2 — Preferred Tags**
- Multi-select tag picker (same as onboarding Step 3)
- Shows tags not currently in Limited or Avoided buckets
- Save button: "Save"

**Section 3 — Limited Tags**
- Multi-select + per-tag weekly cap stepper (same as onboarding Step 4 Limit)
- Shows tags not currently in Preferred or Avoided buckets
- Save button: "Save"

**Section 4 — Avoided Tags**
- Multi-select tag picker
- Shows tags not currently in Preferred or Limited buckets
- Save button: "Save"

**Section 5 — Seasonal Mode**
- Single toggle (on/off)
- Label: "Seasonal suggestions"
- Helper text: "When on, Forkcast adjusts suggestions based on the current season."
- Save button: "Save"

Each section shows a subtle success state ("Saved ✓") for ~2 seconds after
saving, then returns to normal. No full-page reload needed.

---

## Tag Bucket Rules (enforce everywhere)
- A tag cannot be in more than one bucket simultaneously
- When a user adds a tag to a bucket, remove it from any other bucket first
- The tag picker for each bucket only shows tags not already in another bucket
- Tags come from the user's `user_tags` table — never hardcoded

---

## API Routes

### `GET /api/preferences`
- Returns the current user's full preferences
- Response:
```typescript
{
  options_per_day: number
  cooldown_days: number
  seasonal_mode: boolean
  preferred_tags: string[]
  avoided_tags: string[]
  limited_tags: { tag: string, cap: number }[]
}
```

### `PATCH /api/preferences`
- Updates one or more preference fields
- Input: partial of the GET response shape
- `limited_tags` replaces the entire array when provided
- Returns the full updated preferences object
- All fields optional — only update what's sent

---

## Database Changes

### Update `user_preferences` table
Replace the simple `weekly_tag_caps jsonb` column with a cleaner structure:

```sql
-- Add limited_tags as a structured jsonb array
alter table user_preferences
  add column if not exists limited_tags jsonb default '[]';
  -- shape: [{ "tag": "Comfort", "cap": 2 }, ...]

-- preferred_tags and avoided_tags already exist as text[]
-- seasonal_mode, options_per_day, cooldown_days already exist
```

### Seed default preferences on account creation
When a new user account is created, insert a row into `user_preferences`
with all defaults:
```typescript
{
  options_per_day: 3,
  cooldown_days: 28,
  seasonal_mode: true,
  preferred_tags: [],
  avoided_tags: [],
  limited_tags: []
}
```
This should be handled via a Supabase database trigger or in the
post-signup API route — Writer to choose the cleaner approach and
document the decision in the PR.

---

## UI Components

**`components/preferences/StepperInput.tsx`**
- Minus button / numeric display / plus button
- Props: `value`, `min`, `max`, `onChange`
- Disables minus at min, plus at max

**`components/preferences/CooldownSlider.tsx`**
- Range slider 1–60
- Shows friendly label below: "1 week" / "2 weeks" / "1 month (recommended)" / "X days"
- Props: `value`, `onChange`

**`components/preferences/TagBucketPicker.tsx`**
- Reusable multi-select for a single bucket (Preferred, Limited, or Avoided)
- Props: `bucket`, `selected`, `available` (tags not in other buckets), `onChange`
- For Limited bucket: renders a `StepperInput` (cap 1–7) inline next to each
  selected tag pill

**`components/preferences/OnboardingFlow.tsx`**
- Step-by-step wrapper
- Manages current step state
- Renders progress indicator (e.g. "Step 2 of 4" + simple dot indicators)
- Passes collected values through steps, saves only on Done or Skip

**`components/preferences/PreferencesForm.tsx`**
- Single-page settings layout
- Renders all 5 sections with individual Save buttons
- Each section saves independently via `PATCH /api/preferences`

---

## UI Notes
- Onboarding should feel light and friendly — not like a form. Generous spacing,
  one question at a time, clear helper text.
- Settings page should feel organized but not clinical — group related settings
  visually with section headers and subtle dividers.
- Tag pickers should show tag names as pill-style checkboxes — tap to select,
  tap again to deselect. Not a dropdown.
- The cooldown slider label should update live as the user drags — not just on
  release.
- Mobile-friendly throughout — steppers and sliders especially need large
  touch targets.

---

## Out of Scope
- Seasonal rules editor (which tags to favor/cap by season) — that's a
  future advanced settings brief
- Cadence rules editor (e.g. "at least 1 Slow Cooker per 2 weeks")
- Tag creation UI (managing the tag library itself)
- Per-session preference overrides (that's the Help Me Plan screen)
- Notification preferences
- Account settings (name, email, password)

---

## Test Cases
- [ ] New user sees onboarding flow immediately after signup
- [ ] Onboarding Step 1 stepper increments and decrements correctly, clamps at 1 and 5
- [ ] Cooldown slider updates label live while dragging
- [ ] Slider shows "1 month (recommended)" at 28 days
- [ ] "Skip for now" saves defaults and redirects to /recipes
- [ ] "Done" saves all collected values and redirects to /recipes
- [ ] Returning user does not see onboarding flow again
- [ ] `/settings/preferences` loads with current saved values pre-filled
- [ ] Adding a tag to Preferred removes it from Limited or Avoided if present
- [ ] Adding a tag to Limited removes it from Preferred or Avoided if present
- [ ] Each section Save button saves only that section, not the whole form
- [ ] Success state "Saved ✓" appears after saving and disappears after ~2 seconds
- [ ] Limited tag cap stepper clamps at 1 and 7
- [ ] `PATCH /api/preferences` with partial payload only updates sent fields
- [ ] Default preferences row is created for new user on signup

---

## How to Hand This to the Architect

Paste this entire brief into your Forkcast Architect session in AOE with
this message prepended:

> "You are the Forkcast Architect agent. Read CLAUDE.md in the root of
> this repo for your full instructions. Then read
> briefs/brief-03-preference-settings.md and produce a full technical
> spec for the Writer agent to implement. Ask me if anything is ambiguous
> before writing the spec."
