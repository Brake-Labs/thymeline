# Spec 07 — Grocery List

**Status:** Draft  
**Branch:** `feature/grocery-list` from `staging`  
**Depends on:** `feature/recipe-vault`, `feature/help-me-plan` merged to `staging`

---

## 1. Summary

Build the Grocery List feature: generate a deduplicated, grouped, and scaled shopping list from a saved meal plan. Ingredients come from the recipe vault when available, falling back to scraping the recipe URL. The LLM handles grouping and deduplication for ambiguous cases; rule-based parsing handles the straightforward ones. The list is saved per week, editable inline, and shareable via the native share sheet.

People count works at two levels: a plan-level default that applies to all recipes, and per-recipe overrides that stick independently when the plan-level count changes.

---

## 2. DB Changes

### 2a. New `grocery_lists` table

```sql
create table grocery_lists (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  meal_plan_id  uuid not null references meal_plans(id) on delete cascade,
  week_start    date not null,
  people_count  int not null default 2,
  recipe_scales jsonb not null default '[]',
  items         jsonb not null default '[]',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(user_id, week_start)
);
```

**`items` shape:**
```typescript
interface GroceryItem {
  id:        string        // client-generated uuid for keying
  name:      string        // normalized ingredient name
  amount:    number | null
  unit:      string | null
  section:   GrocerySection
  is_pantry: boolean       // flagged as optional pantry staple
  checked:   boolean       // user has checked it off
  recipes:   string[]      // recipe titles this item came from
}

type GrocerySection =
  | 'Produce'
  | 'Proteins'
  | 'Dairy & Eggs'
  | 'Pantry'
  | 'Canned & Jarred'
  | 'Bakery'
  | 'Frozen'
  | 'Other'
```

**`recipe_scales` shape:**
```typescript
interface RecipeScale {
  recipe_id:    string
  recipe_title: string
  people_count: number | null  // null = use plan-level default
}
```

### 2b. RLS on `grocery_lists`

```sql
alter table grocery_lists enable row level security;

create policy "owner full access"
  on grocery_lists for all
  using (auth.uid() = user_id);
```

### 2c. Use `people_count` on `meal_plans`

`meal_plans.people_count` was added in Brief 05 (defaulting to 2). This brief writes to it when the user adjusts the plan-level people count. No migration needed.

### 2d. Update TypeScript types in `types/index.ts`

```typescript
export type GrocerySection =
  | 'Produce'
  | 'Proteins'
  | 'Dairy & Eggs'
  | 'Pantry'
  | 'Canned & Jarred'
  | 'Bakery'
  | 'Frozen'
  | 'Other'

export interface GroceryItem {
  id:        string
  name:      string
  amount:    number | null
  unit:      string | null
  section:   GrocerySection
  is_pantry: boolean
  checked:   boolean
  recipes:   string[]
}

export interface RecipeScale {
  recipe_id:    string
  recipe_title: string
  people_count: number | null  // null = use plan-level default
}

export interface GroceryList {
  id:            string
  user_id:       string
  meal_plan_id:  string
  week_start:    string
  people_count:  number
  recipe_scales: RecipeScale[]
  items:         GroceryItem[]
  created_at:    string
  updated_at:    string
}
```

---

## 3. API Routes

All routes require an authenticated Supabase session. Return `401` if none.

---

### `POST /api/groceries/generate`

**Purpose:** Generate (or regenerate) a grocery list for a given week's meal plan.

**Input:**
```typescript
{ week_start: string }  // "YYYY-MM-DD" (Sunday)
```

**Behavior:**
1. Look up `meal_plans` for `(auth.uid(), week_start)`. Return `404` if none.
2. Fetch all `meal_plan_entries` for the plan, joined with `recipes` (id, title, ingredients, url).
3. For each recipe:
   - If `ingredients` is non-null in the vault: use it directly.
   - If `ingredients` is null and `url` is present: scrape via Firecrawl and extract ingredients using the LLM extraction prompt (same as scrape route). Log a warning if scraping fails but continue.
   - If both are absent: skip and note in `skipped_recipes`.
4. Determine the effective people count per recipe: use `recipe_scales[recipe_id].people_count` if set, otherwise use plan-level `people_count` (default 2).
5. Scale ingredient amounts for each recipe by `(effective_people_count / 2)`.
6. Parse all ingredient strings rule-based first (see §5). Pass ambiguous items to the LLM (see §5).
7. Deduplicate and combine like ingredients across recipes.
8. Group into sections and flag pantry staples (see §5).
9. Initialize `recipe_scales` with one entry per recipe, all `people_count: null` (inherits plan default).
10. Upsert into `grocery_lists` on `(user_id, week_start)` — replace `items` fully on regenerate, reset `recipe_scales` to all-null.
11. Update `meal_plans.people_count` to the current plan-level value.
12. Return the full grocery list.

**Response:**
```typescript
{
  list: GroceryList
  skipped_recipes: string[]
}
```

**Errors:** `404` (no plan), `500` (generation failed).

---

### `GET /api/groceries?week_start=YYYY-MM-DD`

**Purpose:** Fetch the saved grocery list for a given week.

**Response:** `{ list: GroceryList | null }`

---

### `PATCH /api/groceries`

**Purpose:** Save edits — checked state, item additions/removals, plan-level people count, or per-recipe people count override.

**Input:**
```typescript
{
  week_start:    string
  items?:        GroceryItem[]   // full replacement
  people_count?: number          // plan-level; integer 1–20
  recipe_scales?: RecipeScale[]  // full replacement
}
```

**Behavior:**
1. Look up existing row for `(auth.uid(), week_start)`. Return `404` if none.
2. Update provided fields only.
3. If `people_count` changed, also update `meal_plans.people_count`.
4. **Do not rescale items server-side** — scaling is handled client-side and sent as the updated `items` array.
5. Set `updated_at = now()`.

**Response:** `200` with the full updated `GroceryList`.

---

## 4. UI Components

All TypeScript. All Tailwind — no inline styles, no external CSS.

### Routes

| Route | File | Notes |
|---|---|---|
| `/groceries` | `app/(app)/groceries/page.tsx` | Defaults to current week if no `week_start` param |
| `/groceries?week_start=YYYY-MM-DD` | Same file | Main grocery list view |

---

### `app/(app)/groceries/page.tsx`

Server component. Reads `week_start` from query params (defaults to current week's Sunday). Fetches `GET /api/groceries?week_start=`.

- List exists → render `<GroceryListView />`
- No list but meal plan exists → render "Generate your grocery list" prompt with a "Generate" button
- No meal plan → render "No meal plan for this week" with a link to `/plan`

---

### `components/groceries/GroceryListView.tsx`

Client component. Owns local state for items, plan-level people count, and recipe_scales. Syncs to DB via `PATCH /api/groceries` on changes.

**Top bar:**
- Week label: "Groceries for Mar 1 – Mar 7"
- Plan-level people count: `StepperInput` (range 1–20, label "People") — changes rescale all items whose recipe has no override; saves to DB
- "Regenerate" button (secondary) — confirmation dialog before calling generate
- "Share" button (primary) — native share sheet

**Recipe sections:**
- Render one `<RecipeSectionGroup />` per recipe in the plan, ordered by `planned_date`
- Each section shows the recipe's items plus the per-recipe people count stepper

**Bottom:**
- "Add item" button — inline input appended to Other section
- Checked count: "3 of 12 checked" muted text

---

### `components/groceries/RecipeSectionGroup.tsx`

Props: `recipeTitle: string`, `recipeId: string`, `items: GroceryItem[]`, `peopleCount: number`, `isOverridden: boolean`, `onPeopleCountChange: (count: number) => void`, `onToggle`, `onRemove`

- Section heading: recipe title (bold)
- Per-recipe people count stepper (range 1–20) with label "People for this recipe"
  - Shows current effective count (override if set, else plan default)
  - When overridden: shows a small "Custom" badge next to the stepper + a "Reset to default" link
  - On change: sets `recipe_scales[recipeId].people_count`, rescales that recipe's items, saves
  - On "Reset to default": sets `recipe_scales[recipeId].people_count = null`, rescales to plan default, saves
- List of `<GroceryItemRow />` components for this recipe's items
- Pantry items muted with "(optional)"

---

### `components/groceries/GroceryItemRow.tsx`

Props: `item: GroceryItem`, `onToggle: () => void`, `onRemove: () => void`

- Checkbox (tap to check/uncheck)
- Checked: strikethrough + muted
- Amount + unit + name: "2 cloves garlic"
- Swipe left (mobile) or hover (desktop) reveals remove (×) button
- Pantry items: muted + "(optional)"

---

### `components/groceries/AddItemInput.tsx`

Inline text input at the bottom of the list. On submit: appends a new `GroceryItem` to Other section with `is_pantry: false`, `checked: false`, `amount: null`, `unit: null`, `recipes: []`. Dismiss on Escape or tap away.

---

## 5. Ingredient Processing Logic

### Rule-based parsing (server-side)

Parse each ingredient line:
1. **Amount:** leading number or fraction (`1`, `1/2`, `1½`, `2-3`)
2. **Unit:** known unit after amount (tsp, tbsp, cup, oz, lb, g, kg, ml, l, clove, cloves, can, slice, slices, piece, pieces, sprig, sprigs, pinch, handful, bunch, head, stalk, stalks)
3. **Name:** remainder, stripped of parenthetical notes

**Deduplication:** group by normalized name (lowercase, singular). Sum amounts where units match. Flag for LLM if units differ.

### LLM resolution (ambiguous cases only)

Pass to LLM only items that failed rule-based parsing, have conflicting units, or appear to be the same ingredient with different names.

**System prompt:**
```
You are a grocery list assistant. Resolve ambiguous ingredient items.
Return ONLY valid JSON — an array of resolved GroceryItem objects.
Normalize names, reconcile units where possible, assign a section from:
Produce, Proteins, Dairy & Eggs, Pantry, Canned & Jarred, Bakery, Frozen, Other.
Mark is_pantry: true for common staples (salt, pepper, olive oil, garlic,
onion, flour, sugar, butter, common spices, vinegar, soy sauce, etc.)
```

### Scaling

Scale each recipe's ingredient amounts by `(effective_people_count / 2)`. Effective count = `recipe_scales[recipe_id].people_count ?? plan_people_count`. Do not scale `amount: null` items.

### Section assignment (rule-based fallback)

- Produce: common vegetables and fruits
- Proteins: meat, fish, eggs, tofu, tempeh, beans, lentils
- Dairy & Eggs: milk, cheese, cream, yogurt, butter, eggs
- Pantry: oil, flour, sugar, salt, pepper, spices, vinegar, soy sauce, pasta, rice, grains
- Canned & Jarred: canned tomatoes, beans, broth, coconut milk, jarred sauces
- Bakery: bread, tortillas, rolls
- Frozen: frozen vegetables, frozen fruit
- Other: anything unmatched

---

## 6. Share Sheet

```typescript
navigator.share({
  title: `Grocery list — week of ${formatDate(weekStart)}`,
  text: buildPlainTextList(items, recipeScales, planPeopleCount)
})
```

**Plain text format:**
```
🛒 Grocery list — Mar 1–7

Lemon Herb Chicken (4 people)
• 2 lbs chicken thighs
• 1 lemon

Pasta Primavera (2 people)
• 8 oz pasta
• 2 zucchini
...

PANTRY (optional)
• olive oil
• salt & pepper
```

Fall back to `navigator.clipboard.writeText` with a "Copied to clipboard" toast if Web Share API is unavailable.

---

## 7. Entry Points

- **Help Me Plan post-save modal** — "Make my grocery list" → `/groceries?week_start=YYYY-MM-DD`
- **Home screen** — add "Groceries" quick action card linking to `/groceries?week_start=<current Sunday>`
- **Recipe detail page** — "Add to grocery list" link → `/groceries?week_start=<current Sunday>`
- **Nav** — add Groceries to desktop top nav and mobile bottom nav

---

## 8. Business Logic

1. **Plan-level people count is the default.** All recipes inherit it unless overridden. Changing the plan-level count rescales all non-overridden recipes.

2. **Per-recipe override sticks.** Once a recipe has an override, plan-level changes do not affect it. The user must explicitly "Reset to default" to remove the override.

3. **Rescaling is client-side.** The server stores whatever `items` array the client sends. The client computes rescaled amounts before saving.

4. **Checked items are not rescaled.** When people count changes, skip items with `checked: true`.

5. **Regenerate resets all overrides.** `recipe_scales` is reset to all-null on regenerate. Show a confirmation dialog first.

6. **Vault ingredients take priority.** Never scrape a URL if `ingredients` is stored in the vault.

7. **Scraping failure is non-blocking.** Skip the recipe and include in `skipped_recipes`. Never fail the whole list.

8. **Pantry staples are flagged, not removed.** They appear with "(optional)" and muted styling.

9. **Add item goes to Other.** User-added items are never auto-categorized.

10. **Nav on mobile.** Current mobile bottom nav has 4 items (Home, Recipes, Plan, Settings). Add Groceries as a 5th, or use a "More" menu — Writer's choice, keep it clean.

---

## 9. Test Cases

| # | Test case |
|---|---|
| T01 | `/groceries` with no week_start defaults to current week's Sunday |
| T02 | No meal plan shows "plan your meals first" prompt |
| T03 | Meal plan exists but no list shows "Generate" prompt |
| T04 | Generate uses vault ingredients when available |
| T05 | Generate scrapes URL when vault ingredients absent |
| T06 | Scrape failure skips recipe and includes in skipped_recipes |
| T07 | Items are grouped by recipe section |
| T08 | Duplicate ingredients combined (same unit) |
| T09 | Pantry staples flagged with is_pantry: true |
| T10 | Plan-level scaling: 4 people doubles amounts from base 2 |
| T11 | Per-recipe override: changing one recipe's count rescales only that recipe |
| T12 | Plan-level change does not affect recipes with an override |
| T13 | "Reset to default" removes override and rescales to plan default |
| T14 | Overridden recipe shows "Custom" badge |
| T15 | Checked items not rescaled when people count changes |
| T16 | Checking an item saves immediately |
| T17 | Regenerate shows confirmation dialog |
| T18 | Confirming regenerate replaces items and resets all recipe_scales to null |
| T19 | Cancelling regenerate leaves list unchanged |
| T20 | Add item appends to Other section |
| T21 | Remove item removes from list and saves |
| T22 | Share invokes Web Share API with correct plain text format |
| T23 | Share falls back to clipboard when Web Share unavailable |
| T24 | List persists across page reload |
| T25 | Navigating from Help Me Plan post-save modal lands on correct week |
| T26 | Groceries link on recipe detail navigates to current week |
| T27 | Groceries appears in desktop nav and mobile nav |
| T28 | GET /api/groceries returns null when no list exists |
| T29 | PATCH /api/groceries returns 404 for non-existent list |
| T30 | plan-level people_count written to meal_plans on change |

---

## 10. Out of Scope

- Aisle-by-aisle ordering within sections
- Store-specific layouts
- Price estimation
- Grocery delivery integration
- Sharing list with another Forkcast user
- Multi-week grocery lists
- Moving items between sections
