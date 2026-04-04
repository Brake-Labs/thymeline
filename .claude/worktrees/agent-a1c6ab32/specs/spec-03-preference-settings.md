# Technical Spec — Brief 03: Preference Settings

**Spec status:** Draft — Awaiting owner approval before Writer proceeds.
**Branch:** `feature/preference-settings` from `staging`
**Depends on:** `feature/scaffold` merged to `staging`

---

## 1. Summary

Build the two surfaces through which users configure their meal planning preferences:
an onboarding flow shown once after signup, and a persistent settings page at
`/settings/preferences`. Both surfaces read from and write to `user_preferences`
via a single `PATCH /api/preferences` endpoint. The preferences stored here drive
the meal planning engine in future briefs — correctness of the data model matters more
than polish.

---

## 2. DB Changes

### 2a. Alter `user_preferences` — replace `weekly_tag_caps` with `limited_tags`

`weekly_tag_caps` (added in brief-01) stored cap data as a flat object
(`{ "Comfort": 2 }`). The new `limited_tags` column uses a structured array
that is easier to work with in the UI and planning engine. Drop the old column
and add the new one.

```sql
alter table user_preferences
  drop column if exists weekly_tag_caps,
  add column if not exists limited_tags jsonb not null default '[]';
  -- shape: [{ "tag": "Comfort", "cap": 2 }, ...]
```

> **Architect note:** Any future code that referenced `weekly_tag_caps` must
> be updated to use `limited_tags`. No other brief has shipped code against
> that column yet, so this is a clean replacement.

### 2b. Add `onboarding_completed` flag

The brief requires that returning users never see the onboarding flow again.
A boolean flag on `user_preferences` is the canonical way to track this.

```sql
alter table user_preferences
  add column if not exists onboarding_completed bool not null default false;
```

This is set to `true` when the user clicks "Done" or "Skip for now" in the
onboarding flow. It is never reset.

### 2c. Seed default preferences on signup via DB trigger

The brief allows the Writer to choose between a DB trigger and a post-signup
API route. **Use a DB trigger.** It is more reliable (fires regardless of
client behavior) and keeps the seeding logic co-located with the schema.

```sql
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.user_preferences (
    user_id,
    options_per_day,
    cooldown_days,
    seasonal_mode,
    preferred_tags,
    avoided_tags,
    limited_tags,
    onboarding_completed
  ) values (
    new.id,
    3,
    28,
    true,
    '{}',
    '{}',
    '[]',
    false
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

Document this decision in the PR.

### 2d. Update TypeScript types in `types/index.ts`

Replace the `UserPreferences` interface (update if it exists, create if not):

```typescript
export interface LimitedTag {
  tag: string
  cap: number  // 1–7
}

export interface UserPreferences {
  id:                    string
  user_id:               string
  options_per_day:       number
  cooldown_days:         number
  seasonal_mode:         boolean
  preferred_tags:        string[]
  avoided_tags:          string[]
  limited_tags:          LimitedTag[]
  onboarding_completed:  boolean
  created_at:            string
}
```

---

## 3. API Routes

All routes require an authenticated Supabase session. Return `401` if no session.

---

### `GET /api/preferences`

**Purpose:** Return the current user's full preferences.

**Behavior:**
1. Fetch the `user_preferences` row for `auth.uid()`.
2. If no row exists (edge case — trigger should prevent this), return defaults.

**Response:**
```typescript
{
  options_per_day: number
  cooldown_days:   number
  seasonal_mode:   boolean
  preferred_tags:  string[]
  avoided_tags:    string[]
  limited_tags:    { tag: string, cap: number }[]
  onboarding_completed: boolean
}
```

---

### `PATCH /api/preferences`

**Purpose:** Update one or more preference fields for the current user.

**Input:** Any partial subset of the GET response shape. All fields optional.

```typescript
{
  options_per_day?:      number         // validated: integer 1–5
  cooldown_days?:        number         // validated: integer 1–60
  seasonal_mode?:        boolean
  preferred_tags?:       string[]       // validated: all exist in user_tags
  avoided_tags?:         string[]       // validated: all exist in user_tags
  limited_tags?:         { tag: string, cap: number }[]
                                        // validated: tags exist in user_tags,
                                        // cap is integer 1–7
  onboarding_completed?: boolean
}
```

**Behavior:**
1. Validate ranges for `options_per_day` (1–5) and `cooldown_days` (1–60). Return `400` on violation.
2. For any tag arrays provided, validate every tag exists in `user_tags` for the current user. Return `400` listing unknown tags.
3. For `limited_tags`, validate each `cap` is an integer 1–7. Return `400` on violation.
4. **Replacement semantics:** Each array field (`preferred_tags`, `avoided_tags`, `limited_tags`) fully replaces the stored value when present — no merging.
5. Only update columns present in the payload. Use `upsert` on `user_id` in case the trigger row is missing.
6. Return the full updated preferences object.

**Bucket exclusivity is enforced client-side in the UI (see Business Logic §5).
The API does not validate cross-bucket exclusivity** — doing so server-side
would require sending all three buckets on every partial save, which conflicts
with the per-section save UX. The UI is the source of truth for exclusivity.

**Response:** `200` with the full `UserPreferences` object (same shape as GET).

**Errors:**
- `400` — validation failure (range or unknown tag). Include a descriptive message.
- `401` — not authenticated.

---

## 4. UI Components

All TypeScript. All Tailwind — no inline styles, no external CSS.

### Routes

| Route | Component file | Notes |
|---|---|---|
| `/onboarding` | `app/(app)/onboarding/page.tsx` | Multi-step onboarding flow |
| `/settings/preferences` | `app/(app)/settings/preferences/page.tsx` | Settings page |

### Onboarding redirect logic

In the authenticated app layout (`app/(app)/layout.tsx`), after confirming the
user session exists:
1. Fetch `GET /api/preferences`.
2. If `onboarding_completed === false`, redirect to `/onboarding`.
3. Do not redirect if the user is already on `/onboarding` (prevent redirect loops).

This means every page in the `(app)` group checks onboarding on load. Use a
server component layout for this check so it runs before render.

---

### Component List

**`components/preferences/StepperInput.tsx`**
- Props: `value: number`, `min: number`, `max: number`, `onChange: (v: number) => void`, optional `label?: string`
- Minus button / numeric display / plus button
- Minus disabled when `value === min`; plus disabled when `value === max`
- Large touch targets (min 44px hit area) — critical for mobile

**`components/preferences/CooldownSlider.tsx`**
- Props: `value: number`, `onChange: (v: number) => void`
- Range: 1–60, step 1
- Friendly label updates live on every change (not just on release):
  - `7` → "1 week"
  - `14` → "2 weeks"
  - `28` → "1 month (recommended)"
  - `60` → "2 months"
  - Any other value → "X days"
- Large touch target on the thumb

**`components/preferences/TagBucketPicker.tsx`**
- Props:
  ```typescript
  {
    bucket:    'preferred' | 'limited' | 'avoided'
    selected:  string[]                    // for 'preferred' and 'avoided'
    selectedLimited?: LimitedTag[]         // for 'limited' bucket only
    available: string[]                    // tags not in any other bucket
    onChange:  (selected: string[] | LimitedTag[]) => void
  }
  ```
- Renders available tags as pill-style toggle buttons (tap to select, tap again to deselect). Not a dropdown.
- For the `limited` bucket: each selected tag renders with an inline `StepperInput` (cap 1–7, default 2) immediately to its right
- Unselected tags in `available` are shown but not toggled

**`components/preferences/OnboardingFlow.tsx`**
- Manages step state (1–4) with local `useState`
- Collects all values across steps in a single local state object — does NOT save to API between steps
- Renders a progress indicator: "Step X of 4" + 4 dot indicators (filled = completed or current)
- Navigation:
  - "Back" button: go to previous step (step 1 hides Back)
  - "Next" button: advance to next step (disabled on step 4)
  - "Done" button: shown on step 4 instead of "Next" — saves and redirects
  - "Skip for now" link: on every step — saves defaults and redirects
- On "Done": call `PATCH /api/preferences` with all collected values plus `onboarding_completed: true`, then redirect to `/recipes`
- On "Skip for now": call `PATCH /api/preferences` with `{ onboarding_completed: true }` only (preserve DB defaults for everything else), then redirect to `/recipes`

Step content:

| Step | Content |
|---|---|
| 1 | `StepperInput` for `options_per_day` (1–5, default 3) |
| 2 | `CooldownSlider` for `cooldown_days` (1–60, default 28) |
| 3 | `TagBucketPicker` bucket="preferred" showing full tag library |
| 4 | Two sub-sections: `TagBucketPicker` bucket="limited" (tags not in preferred) + `TagBucketPicker` bucket="avoided" (tags not in preferred or limited) |

Each step has its own helper text as specified in the brief.

**`components/preferences/PreferencesForm.tsx`**
- Single scrollable page layout for `/settings/preferences`
- Loads current preferences via `GET /api/preferences` on mount
- Renders 5 independent sections, each with its own local state and Save button
- On section Save: calls `PATCH /api/preferences` with only that section's fields
- After successful save: show "Saved ✓" in muted green text near the button for ~2 seconds, then hide. No full-page reload.
- Sections:

| Section | Fields | API fields sent on Save |
|---|---|---|
| Planning Defaults | `StepperInput` (options_per_day) + `CooldownSlider` (cooldown_days) | `{ options_per_day, cooldown_days }` |
| Preferred Tags | `TagBucketPicker` bucket="preferred" | `{ preferred_tags }` |
| Limited Tags | `TagBucketPicker` bucket="limited" | `{ limited_tags }` |
| Avoided Tags | `TagBucketPicker` bucket="avoided" | `{ avoided_tags }` |
| Seasonal Mode | Toggle switch | `{ seasonal_mode }` |

---

## 5. Business Logic

### Tag bucket exclusivity (client-side)

A tag can only exist in one bucket at a time. The UI enforces this as follows:

- The `available` prop passed to each `TagBucketPicker` is computed by filtering the full tag library to exclude tags already in either of the other two buckets.
- When a user adds tag X to bucket A, remove it from buckets B and C in the local form state before re-computing `available` arrays.
- This logic lives in the parent component (`OnboardingFlow` for onboarding, `PreferencesForm` for settings).

**In onboarding (step 4):** both Limited and Avoided pickers are on the same screen. Available tags for Limited = all tags not in Preferred. Available tags for Avoided = all tags not in Preferred or Limited. Recompute on every change.

**In settings:** each section saves independently, so exclusivity is enforced within the form's local state. When the page loads, initialise local state from the fetched preferences. On Save, send only the changed section's fields. (Note: if a user adds tag X to Preferred in one section and saves, then opens Limited, the Limited picker must not show X. This works automatically if local state is initialised from the latest fetched values at page load and the page is not stale.)

### Validation rules

| Field | Rule |
|---|---|
| `options_per_day` | Integer, 1–5 inclusive |
| `cooldown_days` | Integer, 1–60 inclusive |
| `limited_tags[].cap` | Integer, 1–7 inclusive |
| All tag values | Must exist in current user's `user_tags` table |

### Onboarding "Skip for now" behaviour

"Skip" saves `{ onboarding_completed: true }` only. This marks the user as having
completed onboarding (so they don't see it again) while leaving all preference
fields at their database defaults. Do not save any partially-collected step values
on Skip.

### Partial PATCH semantics

`PATCH /api/preferences` is additive at the field level — only send what changed.
For array fields, the entire array is replaced. This means:
- If a user has `preferred_tags: ["Healthy", "Quick"]` and saves Preferred Tags
  with only `["Healthy"]` selected, the stored value becomes `["Healthy"]`.
- The API never merges or appends array items.

---

## 6. Test Cases

| # | Test case |
|---|---|
| T01 | New user (onboarding_completed = false) is redirected to `/onboarding` on first app load |
| T02 | Returning user (onboarding_completed = true) is NOT redirected to `/onboarding` |
| T03 | Step 1 stepper increments and decrements correctly; clamps at min=1 and max=5 |
| T04 | Step 2 cooldown slider label updates live while dragging |
| T05 | Slider shows "1 month (recommended)" at exactly 28 days |
| T06 | "Skip for now" saves `{ onboarding_completed: true }` only and redirects to `/recipes` |
| T07 | "Done" saves all collected step values plus `onboarding_completed: true` and redirects to `/recipes` |
| T08 | Back button navigates to previous step without saving; collected values persist |
| T09 | `/settings/preferences` loads with all current saved values pre-filled |
| T10 | Adding a tag to Preferred removes it from Limited or Avoided picker in the same view |
| T11 | Adding a tag to Limited removes it from Preferred or Avoided picker in the same view |
| T12 | Each section Save button sends only that section's fields to `PATCH /api/preferences` |
| T13 | "Saved ✓" success state appears after saving and disappears after ~2 seconds |
| T14 | Limited tag cap stepper clamps at 1 (min) and 7 (max) |
| T15 | `PATCH /api/preferences` with only `cooldown_days` does not overwrite other fields |
| T16 | Default preferences row (with correct defaults) is created for a new user on signup |
| T17 | `PATCH /api/preferences` with `options_per_day: 0` returns 400 |
| T18 | `PATCH /api/preferences` with an unknown tag in `preferred_tags` returns 400 |

---

## 7. Out of Scope

- Seasonal rules editor (which tags to favor/cap by season)
- Cadence rules editor (e.g. "at least 1 Slow Cooker per 2 weeks")
- Tag creation / management UI
- Per-session preference overrides (Help Me Plan screen)
- Notification preferences
- Account settings (name, email, password)
- Auth UI (login/signup screens) — onboarding assumes a session already exists

---

*Awaiting owner approval before Writer proceeds.*
