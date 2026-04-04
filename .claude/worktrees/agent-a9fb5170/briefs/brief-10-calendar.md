# Brief 10 — Calendar & Multi-Meal Planning

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/calendar`
**Target:** PR into `staging`
**Depends on:** Briefs 01–07 merged to staging

---

## User Story

As a Forkcast user, I want a weekly calendar view where I can see all my planned
meals at a glance — breakfast, lunch, dinner, and snacks — add side dishes to
dinner and lunch slots, and delete individual items. I also want Help Me Plan to
suggest meals across all meal types, not just dinner.

---

## Screens & Features

### 1. Calendar View (`/calendar`)

A weekly calendar at `/calendar`. Separate from `/plan` (the Help Me Plan wizard).
The nav "Plan" link remains pointing to `/plan`; add a "Calendar" link to the nav.

**Layout — card per day:**
- One card per day of the current week (Sunday–Saturday)
- Cards are collapsed by default showing a summary (e.g. "3 meals planned")
- Tapping/clicking a card expands it to show all meal slots for that day
- Only one card expanded at a time (accordion behavior)
- Week navigation: left/right arrows to move between weeks, displaying the week
  range (e.g. "Mar 16 – Mar 22"). No past week limit. Cap at 4 weeks ahead.

**Each expanded day card shows four meal slots:**
- Breakfast
- Lunch
- Dinner
- Snacks

**Each meal slot shows:**
- The planned recipe name (if assigned), linked to `/recipes/[id]`
- A "+" button to add a recipe to that slot (opens vault search sheet)
- A delete (×) button on each assigned recipe to remove it from the plan
- For Dinner and Lunch slots only: an "Add side dish" link below the main recipe
  (only shown when a main recipe is assigned). Side dishes appear as a indented
  sub-list under the main recipe, each with their own × delete button.

**Empty state:**
- If no plan exists for the week: show a prompt inside each day card —
  "Nothing planned — add a meal or use Help Me Plan"
- "Help Me Plan" links to `/plan`

**Actions available on the calendar:**
- Add any recipe to any meal slot via vault search
- Add side dishes to Dinner and Lunch slots
- Delete individual recipes (main or side dish) from any slot
- Navigate between weeks

---

### 2. Help Me Plan — Multi-Meal Type Support

Update the existing Help Me Plan wizard at `/plan` to support all meal types.

**Setup screen changes:**
- Add a "Which meals are you planning?" multi-select below the day toggles:
  - Breakfast, Lunch, Dinner, Snacks (pill toggles, multi-select)
  - Default: Dinner only (preserve existing behavior for current users)
  - At least one meal type must remain selected
- The LLM generates suggestions for each selected meal type × each active day

**Suggestions screen changes:**
- Each day row expands to show one sub-section per selected meal type
- Each sub-section has its own set of options (based on `options_per_day`)
- Swap and Skip work per meal slot, not per day
- "Confirm Plan" requires at least 1 selection across any slot

**Recipe filtering by meal type:**
- Breakfast suggestions: pull from `category = 'breakfast'` recipes
- Lunch suggestions: pull from `main_dish` recipes (no breakfast/dessert)
- Dinner suggestions: pull from `main_dish` recipes (existing behavior)
- Snacks suggestions: pull from `side_dish` and `dessert` recipes
- If a category has fewer than `options_per_day` eligible recipes after cooldown
  filtering: return what's available (do not error; note the shortfall in the
  response)

---

## API Changes

### `meal_plan_entries` — add `meal_type` and `is_side_dish` columns

```sql
alter table meal_plan_entries
  add column if not exists meal_type text
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'))
    default 'dinner',
  add column if not exists is_side_dish bool not null default false,
  add column if not exists parent_entry_id uuid references meal_plan_entries(id)
    on delete cascade;
```

- `meal_type`: which meal slot this entry belongs to
- `is_side_dish`: true for side dish entries
- `parent_entry_id`: for side dishes, references the main dish entry in the same
  slot. Null for main dishes.

### `POST /api/plan` — update input shape

Add `meal_type` and `is_side_dish` to each entry:

```typescript
entries: {
  date:          string
  recipe_id:     string
  meal_type:     'breakfast' | 'lunch' | 'dinner' | 'snack'
  is_side_dish?: boolean         // default false
  parent_entry_id?: string       // required if is_side_dish = true
}[]
```

Existing callers that omit `meal_type` default to `'dinner'` — backward compatible.

### `GET /api/plan?week_start=YYYY-MM-DD` — update response

Include `meal_type`, `is_side_dish`, and `parent_entry_id` in each entry.

### `DELETE /api/plan/entries/[entry_id]`

New endpoint. Deletes a single `meal_plan_entries` row. Owner only (verify via
`meal_plans.user_id = auth.uid()`). Cascades to any side dish entries whose
`parent_entry_id` matches the deleted entry.

**Response:** `204` no content. `403` if not owner. `404` if not found.

### `POST /api/plan/entries`

New endpoint. Adds a single entry to an existing plan (or creates the plan if
none exists for that week).

**Input:**
```typescript
{
  week_start:       string   // "YYYY-MM-DD" (Sunday)
  date:             string   // "YYYY-MM-DD"
  recipe_id:        string
  meal_type:        'breakfast' | 'lunch' | 'dinner' | 'snack'
  is_side_dish?:    boolean
  parent_entry_id?: string
}
```

**Behavior:**
1. Upsert `meal_plans` for `(user_id, week_start)`
2. Insert the new `meal_plan_entries` row
3. Return the created entry with `recipe_title` joined from `recipes`

**Response:** `201` with the created entry.

### `POST /api/plan/suggest` — update for meal types

Add `active_meal_types` to the input:

```typescript
active_meal_types: ('breakfast' | 'lunch' | 'dinner' | 'snack')[]
```

The route fetches recipes filtered by the appropriate category per meal type
(see filtering rules above) and constructs one LLM prompt covering all meal
types × all active dates.

The LLM response shape expands:

```typescript
{
  days: {
    date: string
    meal_types: {
      meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
      options: {
        recipe_id:    string
        recipe_title: string
        reason?:      string
      }[]
    }[]
  }[]
}
```

---

## UI Components

### `components/calendar/WeekCalendar.tsx`
- Renders 7 `<DayCard />` components for the current week
- Manages which card is expanded (accordion — one at a time)
- Handles week navigation (prev/next arrows, week range label)
- Fetches `GET /api/plan?week_start=` on mount and on week change

### `components/calendar/DayCard.tsx`
Props: `date: string`, `entries: PlanEntry[]`, `isExpanded: boolean`,
`onToggle: () => void`, `onAddEntry`, `onDeleteEntry`

- Collapsed: shows date label + summary ("3 meals planned" or "Nothing planned")
- Expanded: renders one `<MealSlot />` per meal type in order:
  Breakfast → Lunch → Dinner → Snacks

### `components/calendar/MealSlot.tsx`
Props: `mealType`, `entries: PlanEntry[]`, `onAdd`, `onDelete`, `onAddSideDish`

- Label: "Breakfast" / "Lunch" / "Dinner" / "Snacks"
- Lists assigned recipes with × delete button each
- "+" button to add a recipe (opens `VaultSearchSheet`)
- For Dinner and Lunch: shows "Add side dish" link below the main recipe
  (only when at least one main recipe is assigned)
- Side dishes rendered indented below their parent, each with × delete

### `components/plan/MealTypePicker.tsx`
New component for the Help Me Plan setup screen.

Props: `selected: MealType[]`, `onChange: (selected: MealType[]) => void`

- Four pill toggles: Breakfast, Lunch, Dinner, Snacks
- At least one must remain selected (last active pill is non-interactive)

### Updates to `components/plan/SuggestionsStep.tsx`
- Each `SuggestionDayRow` now renders one sub-section per active meal type
- Sub-sections use the same option/select/swap/skip pattern as before
- Swap operates per meal slot (not per day)

---

## Nav Updates

Add "Calendar" to `AppNav`:
- Desktop: between "Plan" and "Settings"
- Mobile bottom nav: replace or add alongside existing tabs (Writer's call on
  what fits — 5 tabs is a lot on mobile; consider combining Plan + Calendar)

---

## Business Logic

1. **Backward compatibility** — existing dinner-only plans remain valid. All
   existing `meal_plan_entries` rows default to `meal_type = 'dinner'` and
   `is_side_dish = false`.

2. **Side dish cascade** — deleting a main dish entry (via `DELETE /api/plan/entries/[id]`)
   must cascade to all side dish entries with `parent_entry_id` matching the
   deleted entry. Handled by the `on delete cascade` FK constraint.

3. **Side dishes only for Dinner and Lunch** — the "Add side dish" affordance
   is never shown for Breakfast or Snacks slots. The API accepts `is_side_dish = true`
   only when `meal_type` is `'dinner'` or `'lunch'`; return `400` otherwise.

4. **One main dish per slot** — each meal slot (date × meal_type) supports one
   main dish and unlimited side dishes. If a main dish already exists for a slot
   and the user adds another, replace the existing one (the old main dish entry
   is deleted; its side dishes cascade). This is UX enforcement — the API
   `POST /api/plan/entries` does not block multiple mains, but the UI only
   shows one main slot.

5. **Accordion behavior** — only one day card is expanded at a time. Tapping
   an expanded card collapses it. Tapping a collapsed card collapses the
   previously open one and expands the new one.

6. **Week navigation** — no past week limit on the calendar (users may want to
   browse history). Future cap: 4 weeks ahead of the current Sunday.

7. **Help Me Plan meal type defaults** — `active_meal_types` defaults to
   `['dinner']` if omitted, preserving behavior for existing API callers.

8. **Recipe category → meal type mapping:**
   - Breakfast slot → `category = 'breakfast'`
   - Lunch slot → `category = 'main_dish'`
   - Dinner slot → `category = 'main_dish'`
   - Snacks slot → `category in ('side_dish', 'dessert')`

---

## Test Cases

| # | Test case |
|---|---|
| T01 | `/calendar` renders 7 day cards for the current week |
| T02 | Clicking a day card expands it; clicking again collapses it |
| T03 | Expanding one card collapses the previously expanded card |
| T04 | Expanded card shows Breakfast, Lunch, Dinner, Snacks slots |
| T05 | Week navigation forward updates the week range label and fetches new plan |
| T06 | Week navigation backward works; no past week limit |
| T07 | Future navigation disabled at 4 weeks ahead |
| T08 | "+" button opens VaultSearchSheet; selecting a recipe calls POST /api/plan/entries |
| T09 | Newly added recipe appears in the correct meal slot |
| T10 | × button on a recipe calls DELETE /api/plan/entries/[id] and removes it from UI |
| T11 | "Add side dish" link appears only on Dinner and Lunch slots with a main dish |
| T12 | Adding a side dish calls POST /api/plan/entries with is_side_dish=true |
| T13 | Side dish appears indented under its parent main dish |
| T14 | Deleting a main dish removes it and its side dishes from the UI |
| T15 | DELETE /api/plan/entries/[id] returns 403 for non-owner |
| T16 | DELETE /api/plan/entries/[id] cascades to side dishes in the DB |
| T17 | POST /api/plan/entries with is_side_dish=true and meal_type=breakfast returns 400 |
| T18 | Empty week shows "Nothing planned" in each day card |
| T19 | Help Me Plan setup shows MealTypePicker with Dinner pre-selected |
| T20 | MealTypePicker cannot deselect the last active meal type |
| T21 | Suggestions screen shows sub-sections per meal type per day |
| T22 | Swap operates on a single meal slot, not the whole day |
| T23 | POST /api/plan/suggest with active_meal_types=[] defaults to ['dinner'] |
| T24 | Breakfast suggestions come only from breakfast-category recipes |
| T25 | Snack suggestions come only from side_dish and dessert recipes |
| T26 | Saved multi-meal plan appears correctly on /calendar |
| T27 | Calendar nav link appears in AppNav desktop and mobile |
| T28 | Existing dinner-only plans render correctly (backward compat) |

---

## Out of Scope

- Drag-and-drop reordering of meals within a day
- Copying a day's plan to another day
- Recurring meals (e.g. "oatmeal every weekday")
- Google/Apple Calendar sync (future brief)
- Nutritional totals per day
- Grocery list integration with meal type (side dishes added to grocery list — future)
- Cook Mode per meal slot
