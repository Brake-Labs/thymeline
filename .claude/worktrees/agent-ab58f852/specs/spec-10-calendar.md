# Spec 10 — Calendar & Multi-Meal Planning

**Status:** Draft — Awaiting owner approval before Writer proceeds.
**Branch:** `feature/calendar` from `staging`
**Depends on:** Briefs 01–07 merged to `staging`

---

> **Corrections to Spec-05 — Help Me Plan:**
> Spec-10 makes the following breaking changes to the Help Me Plan wizard.
> The Writer implementing Brief 10 must apply all of these when working on
> the `/plan` feature:
>
> 1. **`POST /api/plan/suggest` — non-streaming only.** The streaming NDJSON
>    path (and all streaming-related client logic) is removed. The route now
>    returns a standard JSON response. The non-streaming fallback in spec-05
>    becomes the only path.
>
> 2. **`DaySuggestions` shape change.** The `options: RecipeSuggestion[]`
>    field is replaced with `meal_types: MealTypeSuggestions[]`. Callers
>    that expect `options` directly on a day must be updated.
>
> 3. **`DaySelection` shape change.** A `meal_type: MealType` field is added.
>
> 4. **`SelectionsMap` key change.** Keys are now `"${date}:${meal_type}"`
>    composite strings, not bare dates.
>
> 5. **`PlanSetup` shape change.** An `activeMealTypes: MealType[]` field is
>    added. Always initialised to `['dinner']`.
>
> 6. **`SuggestionsState` shape change.** Each day entry's `options` and
>    `isSwapping` fields are moved inside a `meal_types` array.
>
> 7. **`SavedPlanEntry` shape change.** `meal_type`, `is_side_dish`, and
>    `parent_entry_id` fields are added.
>
> 8. **`SuggestionDayRow` decomposed.** A new `SuggestionMealSlotRow`
>    component handles per-slot options; `SuggestionDayRow` becomes a
>    container for the day heading and its slot rows.
>
> 9. **`SummaryStep` updated** to group confirmed meals by date and show
>    meal type per entry.

---

## 1. Summary

Build a weekly calendar view at `/calendar` that lets users see and manually
edit their full meal plan across all meal types (Breakfast, Lunch, Dinner,
Snacks). Update the Help Me Plan wizard at `/plan` to support multi-meal
suggestions. Both surfaces share the same `meal_plan_entries` data, extended
with `meal_type`, `is_side_dish`, and `parent_entry_id` columns.

The calendar is a separate page from `/plan`. Help Me Plan gains a
`MealTypePicker` on its setup screen; suggestions and the confirmation flow
expand to cover all selected meal types. The planning wizard always opens with
Dinner pre-selected — meal type choice is ephemeral and not saved.

---

## 2. DB Changes

### 2a. Migration: extend `meal_plan_entries`

**File:** `supabase/migrations/010_meal_plan_entries_meal_types.sql`

```sql
alter table meal_plan_entries
  add column if not exists meal_type text
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'))
    default 'dinner',
  add column if not exists is_side_dish bool not null default false,
  add column if not exists parent_entry_id uuid
    references meal_plan_entries(id) on delete cascade;
```

All existing rows get `meal_type = 'dinner'`, `is_side_dish = false`,
`parent_entry_id = null` via the column defaults. No backfill query needed.

### 2b. TypeScript types — update `types/index.ts`

**New type:**
```typescript
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
```

**Updated `SavedPlanEntry`** (adds three new fields):
```typescript
export interface SavedPlanEntry {
  id:               string
  meal_plan_id:     string
  recipe_id:        string
  recipe_title?:    string        // joined from recipes in GET /api/plan response
  planned_date:     string
  position:         number
  confirmed:        boolean
  meal_type:        MealType      // new
  is_side_dish:     boolean       // new
  parent_entry_id:  string | null // new
}
```

**New `PlanEntry`** — used by calendar components:
```typescript
export interface PlanEntry {
  id:               string
  recipe_id:        string
  recipe_title:     string
  planned_date:     string
  meal_type:        MealType
  is_side_dish:     boolean
  parent_entry_id:  string | null
  confirmed:        boolean
  position:         number
}
```

**Updated `DaySuggestions`** — replaces `options` with `meal_types`:
```typescript
export interface MealTypeSuggestions {
  meal_type: MealType
  options:   RecipeSuggestion[]
}

export interface DaySuggestions {
  date:       string
  meal_types: MealTypeSuggestions[]
}

// SuggestionsResponse is unchanged structurally:
export interface SuggestionsResponse {
  days: DaySuggestions[]
}
```

**Updated `DaySelection`** — adds `meal_type`:
```typescript
export interface DaySelection {
  date:         string
  meal_type:    MealType    // new
  recipe_id:    string
  recipe_title: string
  from_vault:   boolean
}
```

---

## 3. API Routes

All routes require an authenticated Supabase session. Return `401` if none.

---

### `POST /api/plan/suggest` — updated (non-streaming, multi-meal)

> **Replaces** the streaming implementation in spec-05. Streaming path is
> removed entirely. Standard JSON response only.

**Input:**
```typescript
{
  week_start:         string      // "YYYY-MM-DD" (Sunday)
  active_dates:       string[]    // non-empty; all within the specified week
  active_meal_types:  MealType[]  // new; defaults to ['dinner'] if omitted
  prefer_this_week:   string[]
  avoid_this_week:    string[]
  free_text:          string
  specific_requests:  string
}
```

**Server-side behavior:**
1. Validate `active_dates` is non-empty. Return `400` if not.
2. Validate `week_start` is a Sunday. Return `400` if not.
3. Coerce `active_meal_types` to `['dinner']` if omitted or empty.
4. For each `meal_type` in `active_meal_types`, fetch the user's eligible
   recipes filtered by category (see §5, Business Logic rule 8) and cooldown.
   Produce a per-meal-type recipe list: `Record<MealType, RecipeListItem[]>`.
5. Fetch user preferences and recent history (same as spec-05 §5).
6. Construct the multi-meal LLM prompt (see §5 LLM Integration below).
7. Call the LLM via `lib/llm.ts`. Await the full response.
8. Validate every `recipe_id` in the response against the per-meal-type recipe
   lists. Drop invalid options silently. If all options for a slot are dropped,
   include `options: []` for that slot.
9. Return standard JSON.

**Response:**
```typescript
{ days: DaySuggestions[] }
```

**Errors:** `400` (validation), `500` (LLM failure).

---

### `POST /api/plan/suggest/swap` — updated (meal_type aware)

**Input:**
```typescript
{
  date:             string
  meal_type:        MealType   // new; the specific slot being swapped
  week_start:       string
  already_selected: { date: string, meal_type: MealType, recipe_id: string }[]
  prefer_this_week: string[]
  avoid_this_week:  string[]
  free_text:        string
}
```

**Behavior:** Fetches only the recipe list for the given `meal_type`'s category.
Constructs a focused swap prompt (see §5). Returns non-streaming JSON.

**Response:**
```typescript
{ date: string, meal_type: MealType, options: RecipeSuggestion[] }
```

---

### `POST /api/plan` — updated (meal_type in entries)

**Input shape change** — each entry now accepts `meal_type`, `is_side_dish`,
`parent_entry_id`. Existing callers that omit `meal_type` get `'dinner'`.

```typescript
{
  week_start: string
  entries: {
    date:             string
    recipe_id:        string
    meal_type?:       MealType   // default 'dinner'
    is_side_dish?:    boolean    // default false
    parent_entry_id?: string     // required if is_side_dish = true
  }[]
}
```

Behavior steps 1–5 from spec-05 are unchanged. In step 5, each inserted
`meal_plan_entries` row now also sets `meal_type`, `is_side_dish`, and
`parent_entry_id` from the entry payload (defaulting as above).

**Response:** unchanged (`{ plan_id, entries: SavedPlanEntry[] }`).

---

### `GET /api/plan?week_start=YYYY-MM-DD` — updated response

Each entry in the response now includes `meal_type`, `is_side_dish`, and
`parent_entry_id`.

**Updated entry shape:**
```typescript
{
  id:               string
  planned_date:     string
  recipe_id:        string
  recipe_title:     string
  position:         number
  confirmed:        boolean
  meal_type:        MealType
  is_side_dish:     boolean
  parent_entry_id:  string | null
}
```

---

### `POST /api/plan/entries` — new

**Purpose:** Add a single entry to an existing plan (or create the plan if
none exists for that week). Used by the calendar "+" action.

**Input:**
```typescript
{
  week_start:       string    // "YYYY-MM-DD" (Sunday)
  date:             string    // "YYYY-MM-DD"
  recipe_id:        string
  meal_type:        MealType
  is_side_dish?:    boolean   // default false
  parent_entry_id?: string    // required if is_side_dish = true
}
```

**Behavior:**
1. Validate `date` falls within the week of `week_start`. Return `400` if not.
2. Validate `week_start` is a Sunday. Return `400` if not.
3. If `is_side_dish = true` and `meal_type` is not `'dinner'` or `'lunch'`:
   return `400 "Side dishes are only allowed for Dinner and Lunch slots."`.
4. If `is_side_dish = true` and `parent_entry_id` is absent: return `400`.
5. Upsert `meal_plans` on `(user_id, week_start)`.
6. Insert the new `meal_plan_entries` row with `position = 1`, `confirmed = true`.
7. Return the created entry with `recipe_title` joined from `recipes`.

**Response:** `201` with the created `PlanEntry`.

**Errors:** `400` (validation), `404` (plan not found — should not occur due to
upsert), `500`.

---

### `DELETE /api/plan/entries/[entry_id]` — new

**Purpose:** Delete a single entry from a plan. Used by the calendar × button.

**Behavior:**
1. Look up the `meal_plan_entries` row by `entry_id`. Return `404` if not found.
2. Verify ownership: `meal_plans.user_id = auth.uid()` via join. Return `403`
   if not owner.
3. Delete the row. The `on delete cascade` FK on `parent_entry_id` automatically
   removes any side dish entries that reference this entry.

**Response:** `204` no content.

---

## 4. Client-Side State Changes (Help Me Plan)

All state types in `app/(app)/plan/page.tsx` are updated.

```typescript
// Updated PlanSetup — adds activeMealTypes
interface PlanSetup {
  weekStart:        string
  activeDates:      string[]
  activeMealTypes:  MealType[]   // new; always initialised to ['dinner']
  preferThisWeek:   string[]
  avoidThisWeek:    string[]
  freeText:         string
  specificRequests: string
}

// Updated SuggestionsState — meal_types replace options at the day level
interface SuggestionsState {
  days: {
    date: string
    meal_types: {
      meal_type:  MealType
      options:    RecipeSuggestion[]
      isSwapping: boolean
    }[]
  }[]
}

// SelectionsMap key: "${date}:${meal_type}" composite string
// e.g. "2026-03-16:dinner"
type SelectionsMap = Record<string, DaySelection | null>

// Top-level PlanPageState — unchanged structurally
interface PlanPageState {
  setup:        PlanSetup
  suggestions:  SuggestionsState | null
  selections:   SelectionsMap
  isGenerating: boolean
}
```

**Key behavioral change:** "Confirm Plan" requires at least 1 non-null entry
in `SelectionsMap` (any slot). Skipped slots (`null`) and unselected slots
(absent key) do not count.

---

## 5. LLM Integration

### Multi-meal suggestion prompt

**System message:**
```
You are a meal planning assistant. Suggest meals across multiple meal types
for specific days of the week.

Rules you must follow exactly:
- Only suggest recipes from the provided recipe lists. Never invent recipes.
- Only use recipe_ids from the provided lists. Never guess or modify ids.
- Return exactly {options_per_day} options per meal slot.
- Never suggest the same recipe for more than one slot (across all days and types).
- Never suggest recipes with avoided tags: {avoided_tags_combined}.
- Prefer recipes with preferred tags: {preferred_tags_combined}.
- Respect weekly tag caps: {limited_tags_summary}.
- Current season is {season}. {seasonal_instructions}
- Variety matters: spread different recipe types across days.

Return ONLY valid JSON in this exact format, with no prose, no markdown:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "meal_types": [
        {
          "meal_type": "dinner",
          "options": [
            {
              "recipe_id": "uuid",
              "recipe_title": "Recipe Name",
              "reason": "One-line reason"
            }
          ]
        }
      ]
    }
  ]
}
```

**User message:**
```
Plan meals for these dates: {active_dates_list}
Meal types to plan: {active_meal_types_list}

{per_meal_type_recipe_lists}
  // For each meal type, a labeled block:
  // "Breakfast recipes (eligible):\n[{id, title, tags}, ...]"
  // "Dinner recipes (eligible):\n[{id, title, tags}, ...]"
  // etc.

Recent meal history (avoid repeating recent meals):
{recent_history_json}

User context for this week:
{free_text}

Specific requests (best-effort):
{specific_requests}
```

### Swap prompt (updated)

Same system message as above. User message changes:
- `active_dates_list` is the single swap date
- `active_meal_types_list` is the single swap meal type
- Include only the recipe list for that meal type's category
- Add: `"Recipes already selected for other slots (do not repeat): {already_selected_titles}"`

### Category → recipe fetch mapping (server-side)

| `meal_type` | `recipes.category` filter |
|---|---|
| `breakfast` | `'breakfast'` |
| `lunch` | `'main_dish'` |
| `dinner` | `'main_dish'` |
| `snack` | `'side_dish'`, `'dessert'` |

Apply cooldown filtering per category, same as spec-05 §5 step 3.

If a category yields fewer than `options_per_day` eligible recipes after
cooldown filtering, return what's available. Do not error; the LLM will
return fewer options for that slot.

---

## 6. UI Components

All TypeScript. All Tailwind — no inline styles, no external CSS.

---

### `app/(app)/calendar/page.tsx`

Lightweight `'use client'` page. Renders `<WeekCalendar />` and passes the
current week's Sunday as the initial `weekStart`. Reads nothing from the DB
directly — `WeekCalendar` fetches via the API.

---

### `components/calendar/WeekCalendar.tsx`

Manages which week is displayed and which day card is expanded.

- Initialises `weekStart` to the current week's Sunday on mount.
- Fetches `GET /api/plan?week_start=` on mount and on every week change.
  Groups the returned entries by `planned_date`.
- Renders 7 `<DayCard />` components (Sunday–Saturday).
- Tracks `expandedDate: string | null` — accordion state (one card at a time).
- **Week navigation:** left/right arrow buttons + week range label
  (e.g. `"Mar 16 – Mar 22"`). No past week limit. Right arrow disabled
  when `weekStart` is 4 Sundays ahead of the current Sunday.
- Passes `onAddEntry` and `onDeleteEntry` callbacks down to day cards;
  updates local entry state optimistically on success.

---

### `components/calendar/DayCard.tsx`

Props: `date: string`, `entries: PlanEntry[]`, `isExpanded: boolean`,
`onToggle: () => void`, `onAddEntry: (date, mealType, recipeId, isSideDish?, parentEntryId?) => void`,
`onDeleteEntry: (entryId: string) => void`

- **Collapsed:** date label (e.g. `"Mon Mar 16"`) + summary text:
  `"3 meals planned"` if entries exist, `"Nothing planned"` if empty.
- **Expanded:** renders four `<MealSlot />` components in order:
  Breakfast → Lunch → Dinner → Snacks.
  When no plan exists for the week, shows a prompt inside the expanded
  card: `"Nothing planned — add a meal or use Help Me Plan"` with a
  link to `/plan`.
- Accordion: tapping a collapsed card collapses the previously open one
  and expands the new one (managed in `WeekCalendar`).
- Tapping an expanded card collapses it.

---

### `components/calendar/MealSlot.tsx`

Props: `mealType: MealType`, `entries: PlanEntry[]`, `onAdd: () => void`,
`onDelete: (entryId: string) => void`, `onAddSideDish: (parentEntryId: string) => void`

- **Slot label:** `"Breakfast"` / `"Lunch"` / `"Dinner"` / `"Snacks"`.
- Lists non-side-dish entries for this slot. Each shows:
  - Recipe title linked to `/recipes/[recipe_id]`
  - `×` delete button — calls `onDelete(entry.id)`
- **Side dishes** (Dinner and Lunch only): indented below their parent entry.
  Each shows recipe title + `×` delete button.
- **"Add side dish" link:** shown below a main recipe in Dinner/Lunch slots
  only when `entries` contains at least one non-side-dish entry. Calls
  `onAddSideDish(mainEntry.id)` which opens `VaultSearchSheet` pre-filtered
  for side dish / dessert categories.
- **"+" button:** always shown in every slot. Opens `<VaultSearchSheet />`
  filtered by the slot's appropriate category (see §5 category mapping).
- On `VaultSearchSheet` assign: calls `onAdd` with the relevant arguments;
  `WeekCalendar` calls `POST /api/plan/entries` and updates local state.

---

### `components/plan/MealTypePicker.tsx` — new

Props: `selected: MealType[]`, `onChange: (selected: MealType[]) => void`

- Four pill toggles: `"Breakfast"`, `"Lunch"`, `"Dinner"`, `"Snacks"`.
- Tap to toggle. At least one must remain selected — the last active pill
  is non-interactive (no pointer cursor, no toggle on click). Show helper:
  `"At least 1 meal type required"`.
- `"Dinner"` is pre-selected when the wizard initialises.

---

### `components/plan/VaultSearchSheet.tsx` — updated

Adds an optional `mealType?: MealType` prop. When provided, the recipe list
loaded from `GET /api/recipes` is filtered client-side to only show recipes
in the appropriate category (per §5 mapping). When absent, all categories
are shown (existing Help Me Plan behavior is preserved).

The `onAssign` callback signature simplifies to:
```typescript
onAssign: (recipe: { recipe_id: string, recipe_title: string }) => void
```
The parent is responsible for constructing the full `DaySelection` or
`PlanEntry` context.

---

### `components/plan/SetupStep.tsx` — updated

Add `<MealTypePicker />` below `<DayTogglePicker />`:
- Label: `"Which meals are you planning?"`
- Binds to `setup.activeMealTypes`
- Default: `['dinner']` (always reset to this when the wizard mounts)

---

### `components/plan/SuggestionsStep.tsx` — updated

- Pass `activeMealTypes` down from `PlanPageState.setup` to `SuggestionDayRow`.
- "Regenerate unselected slots only" — a slot is unselected when
  `selections["${date}:${mealType}"]` is `undefined`. Slots with `null`
  (explicitly skipped) are also preserved.
- "Confirm Plan" button disabled when `SelectionsMap` has zero non-null
  entries across all slots.

---

### `components/plan/SuggestionDayRow.tsx` — updated

Now a container for the day heading; delegates slot rendering to
`<SuggestionMealSlotRow />`.

Props: `date: string`, `mealTypeSuggestions: SuggestionsState['days'][number]['meal_types']`,
`selections: SelectionsMap`, `activeMealTypes: MealType[]`,
`activeDates: string[]`, `onSelect`, `onSkip`, `onSwap`,
`onAssignToDay`, `onVaultPick`, `onFreeTextMatch`

Renders:
- Day heading: `"Monday Mar 16"`
- One `<SuggestionMealSlotRow />` per entry in `mealTypeSuggestions`,
  in order: Breakfast → Lunch → Dinner → Snacks.

---

### `components/plan/SuggestionMealSlotRow.tsx` — new

Contains the per-slot options grid, Swap, Skip, VaultSearchSheet, and
free-text match logic that was previously in `SuggestionDayRow`.

Props: `date: string`, `mealType: MealType`, `options: RecipeSuggestion[]`,
`selection: DaySelection | null | undefined`, `isSwapping: boolean`,
`activeDates: string[]`, `onSelect`, `onSkip`, `onSwap`,
`onAssignToDay`, `onVaultPick`, `onFreeTextMatch`

Layout:
```
Dinner                                        [Swap]  [Skip this slot]
┌────────────────────────────────────────────────────────────┐
│ Option 1: Lemon Herb Chicken             [Select]           │
│ Quick · Healthy                                             │
│ "Great weeknight option"                                    │
│                              [Use for a different day]      │
├────────────────────────────────────────────────────────────┤
│ Option 2: ...                                               │
└────────────────────────────────────────────────────────────┘
[Pick from my vault]   [Something else in mind? ▾]
```

Behavior mirrors spec-05's `SuggestionDayRow` but scoped to a single
`(date × meal_type)` slot. "Skip this slot" marks
`selections["${date}:${mealType}"] = null`. "Swap" calls the updated
`POST /api/plan/suggest/swap` with `meal_type`.

---

### `components/plan/SummaryStep.tsx` — updated

Groups confirmed entries by date, showing meal type per entry:

```
Monday Mar 16
  Breakfast — Oatmeal Bowl
  Dinner    — Lemon Herb Chicken

Tuesday Mar 17
  Dinner    — Pasta Primavera

Skipping: Wednesday (Dinner)
```

"Skipping" line lists slots where `SelectionsMap[key] === null`, formatted
as `"Day (Meal Type)"`.

The `POST /api/plan` payload is built by iterating `SelectionsMap` for all
non-null, non-undefined entries and mapping to the updated entry shape.

---

### AppNav — updated

Add `"Calendar"` link:
- **Desktop:** between `"Plan"` and `"Settings"`.
- **Mobile bottom nav:** Writer's choice on layout. Current nav has 4 tabs
  (Home, Recipes, Plan, Settings). With Groceries (spec-07) and Calendar
  (this spec), that's 6 total. Acceptable approaches: a `"More"` overflow
  tab, icon-only tabs with tooltips, or combining `"Plan"` and `"Calendar"`
  under one icon. Keep it clean and accessible.

---

## 7. Business Logic

1. **Backward compatibility.** Existing `meal_plan_entries` rows default to
   `meal_type = 'dinner'`, `is_side_dish = false`, `parent_entry_id = null`.
   All existing plan data renders correctly in the calendar's Dinner slot.

2. **Side dish cascade.** Deleting a main dish entry via
   `DELETE /api/plan/entries/[id]` cascades to all side dish entries with
   matching `parent_entry_id`. This is handled by the DB FK `on delete cascade`.
   No additional server-side logic required.

3. **Side dishes only for Dinner and Lunch.** The `"Add side dish"` UI is
   never shown for Breakfast or Snacks slots. The API (`POST /api/plan/entries`)
   returns `400` if `is_side_dish = true` and `meal_type` is not `'dinner'`
   or `'lunch'`.

4. **One main dish per slot (UI enforcement).** Each (date × meal_type) slot
   supports one main dish and unlimited side dishes. If a main dish already
   exists for a slot and the user adds another via the `"+"` button,
   `WeekCalendar` silently deletes the existing main (and its side dishes,
   via cascade) before inserting the new one. No confirmation dialog.
   The API itself does not block multiple mains.

5. **Accordion behavior.** Only one `DayCard` is expanded at a time.
   Tapping an expanded card collapses it. Tapping a collapsed card collapses
   the current one (if any) and expands the new one.

6. **Week navigation.** No past week limit on the calendar. Future cap: 4
   Sundays ahead of the current Sunday. `WeekCalendar` disables the right
   arrow at this boundary.

7. **`active_meal_types` is ephemeral.** Never saved to the DB or
   `user_preferences`. The Help Me Plan wizard always opens with
   `activeMealTypes = ['dinner']` regardless of the user's previous session.

8. **Category → meal type mapping** (see §5 LLM Integration). Applied both
   server-side (recipe fetching for suggestions) and client-side (filtering
   in `VaultSearchSheet` and side dish add sheet).

9. **Non-streaming `POST /api/plan/suggest`.** The route awaits the full LLM
   response and returns `Content-Type: application/json`. No streaming
   headers, no `TransformStream`, no NDJSON parsing on the client.

10. **`POST /api/plan` upserts still replace all entries.** Step 4 (delete all
    existing `meal_plan_entries` for the `meal_plan_id`) is unchanged. The full
    updated payload (across all meal types) is sent from the summary step.

11. **SelectionsMap composite key format:** `"${date}:${meal_type}"` —
    e.g. `"2026-03-16:dinner"`. The client and summary step must use this
    key format consistently when reading and writing selections.

---

## 8. File Structure

New files:
```
supabase/migrations/010_meal_plan_entries_meal_types.sql
app/(app)/calendar/page.tsx
components/calendar/WeekCalendar.tsx
components/calendar/DayCard.tsx
components/calendar/MealSlot.tsx
components/plan/MealTypePicker.tsx
components/plan/SuggestionMealSlotRow.tsx
```

Modified files:
```
types/index.ts
  — add MealType, PlanEntry
  — update SavedPlanEntry, DaySuggestions, DaySelection

app/(app)/plan/page.tsx
  — update PlanSetup, SuggestionsState, SelectionsMap, PlanPageState types
  — initialise activeMealTypes = ['dinner']

app/api/plan/suggest/route.ts
  — remove streaming; add active_meal_types; update prompt + response shape

app/api/plan/suggest/swap/route.ts
  — add meal_type to input and response

app/api/plan/route.ts
  — POST: accept meal_type, is_side_dish, parent_entry_id per entry
  — GET: include new fields in each entry in the response

app/api/plan/entries/route.ts            — new (POST handler)
app/api/plan/entries/[entry_id]/route.ts — new (DELETE handler)

components/plan/SetupStep.tsx            — add MealTypePicker
components/plan/SuggestionsStep.tsx      — update for multi-meal slots
components/plan/SuggestionDayRow.tsx     — refactor to container + MealSlotRow
components/plan/SummaryStep.tsx          — group by date, show meal type
components/plan/VaultSearchSheet.tsx     — add mealType? prop, update onAssign

AppNav (location TBD by existing implementation)
  — add Calendar link
```

---

## 9. Test Cases

| # | Test case |
|---|---|
| T01 | `/calendar` renders 7 day cards for the current week |
| T02 | Clicking a day card expands it; clicking again collapses it |
| T03 | Expanding one card collapses the previously expanded card |
| T04 | Expanded card shows Breakfast, Lunch, Dinner, Snacks slots |
| T05 | Week navigation forward updates the week range label and re-fetches the plan |
| T06 | Week navigation backward works; no past week limit |
| T07 | Right navigation arrow is disabled at 4 weeks ahead |
| T08 | "+" button opens VaultSearchSheet filtered by the slot's category |
| T09 | Selecting a recipe from VaultSearchSheet calls POST /api/plan/entries and appears in the slot |
| T10 | × button on a recipe calls DELETE /api/plan/entries/[id] and removes it from the UI |
| T11 | "Add side dish" link appears only on Dinner and Lunch slots with a main dish present |
| T12 | Adding a side dish calls POST /api/plan/entries with is_side_dish=true and correct parent_entry_id |
| T13 | Side dish appears indented under its parent main dish |
| T14 | Deleting a main dish removes it and its side dishes from the UI |
| T15 | DELETE /api/plan/entries/[id] returns 403 for non-owner |
| T16 | Deleting a main dish cascades to its side dishes in the DB |
| T17 | POST /api/plan/entries with is_side_dish=true and meal_type=breakfast returns 400 |
| T18 | POST /api/plan/entries with is_side_dish=true and no parent_entry_id returns 400 |
| T19 | Empty week shows "Nothing planned" prompt with link to /plan |
| T20 | Adding a second main to an occupied slot replaces the first (and its side dishes) silently |
| T21 | Existing dinner-only plans render correctly in the calendar's Dinner slot |
| T22 | Help Me Plan setup screen shows MealTypePicker with Dinner pre-selected |
| T23 | MealTypePicker cannot deselect the last active meal type |
| T24 | Selecting Breakfast + Dinner sends both in active_meal_types to POST /api/plan/suggest |
| T25 | Suggestions screen shows sub-sections per active meal type for each day |
| T26 | Swap operates on a single (date × meal_type) slot; other slots are unchanged |
| T27 | While a slot is swapping, only that slot shows a skeleton loading state |
| T28 | POST /api/plan/suggest returns non-streaming JSON (no NDJSON content-type) |
| T29 | Breakfast suggestions come only from breakfast-category recipes |
| T30 | Snack suggestions come only from side_dish and dessert recipes |
| T31 | Fewer than options_per_day eligible recipes returns what's available without erroring |
| T32 | "Confirm Plan" is disabled with zero selections across all slots |
| T33 | Summary groups confirmed meals by date and shows meal type per entry |
| T34 | Summary "Skipping" line shows date + meal type for null selections |
| T35 | POST /api/plan saves entries with correct meal_type for each slot |
| T36 | Saved multi-meal plan appears correctly on /calendar |
| T37 | Calendar nav link appears in AppNav desktop and mobile |
| T38 | active_meal_types always defaults to ['dinner'] when the wizard opens |

---

## 10. Out of Scope

- Drag-and-drop reordering of meals within a day
- Copying a day's plan to another day
- Recurring meals
- Google/Apple Calendar sync
- Nutritional totals per day
- Grocery list integration with meal type (side dishes in grocery list)
- Cook Mode per meal slot

---

*Awaiting owner approval before Writer proceeds.*
