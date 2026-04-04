# Spec 11 — Recipe Dashboard & Card Redesign

**Brief:** `briefs/brief-11-recipe-dashboard.md`
**Branch:** `feature/recipe-dashboard` from `staging`
**Status:** Awaiting owner approval before Writer proceeds.

---

## 1. Summary

This feature replaces the existing recipe vault list (a plain table with basic tag filters) with a full-featured recipe browser: a card-grid / list-view toggle, a collapsible filter panel with tag groups, a time slider, a date-range picker, and LLM-powered semantic search. It also redesigns the recipe detail page to look like an elegant physical recipe card, adds four time fields to the recipe model, and introduces bulk multi-select with tag assignment and deletion.

---

## 2. Pre-existing Artifacts on This Branch

The following files were started on `hotfix/tag-taxonomy-v3` and are already present as untracked files. **Do not recreate them.** Confirm their content matches the spec and extend if needed.

| File | Status |
|---|---|
| `lib/format-time.ts` | Already correct — matches brief exactly |
| `lib/__tests__/format-time.test.ts` | Already covers T38–T41 |
| `supabase/migrations/011_recipe_time_fields.sql` | Already correct — adds all four `*_time_minutes` columns |

> The brief names the migration `012_recipe_time_fields.sql` but `011` is the correct next sequential number in this repo. **Use `011_recipe_time_fields.sql`.** Do not create a `012` duplicate.

---

## 3. DB Changes

### Migration: `supabase/migrations/011_recipe_time_fields.sql` (already exists)

```sql
alter table recipes
  add column if not exists prep_time_minutes     int,
  add column if not exists cook_time_minutes      int,
  add column if not exists total_time_minutes     int,
  add column if not exists inactive_time_minutes  int;
```

No other schema changes. All filtering and search is client-side or via the existing `recipes` + `recipe_history` tables.

---

## 4. TypeScript Types (`types/index.ts`)

### 4a. Extend `Recipe`

Add four nullable time fields:

```typescript
prep_time_minutes:      number | null
cook_time_minutes:      number | null
total_time_minutes:     number | null
inactive_time_minutes:  number | null
```

### 4b. Extend `RecipeListItem`

Add one field (needed for card display and list-view sorting):

```typescript
total_time_minutes: number | null
```

### 4c. New type: `RecipeFilters`

Used by the filter panel and the AI search endpoint:

```typescript
export interface RecipeFilters {
  tags:             string[]           // AND logic
  categories:       Recipe['category'][]
  maxTotalMinutes:  number | null      // null = inactive (show all)
  lastMadeFrom:     string | null      // "YYYY-MM-DD"
  lastMadeTo:       string | null      // "YYYY-MM-DD"
  neverMade:        boolean
}
```

---

## 5. API Routes

### 5a. `GET /api/recipes` — extend existing

**Change:** Add `total_time_minutes` to the select projection so `RecipeListItem` is fully populated.

```typescript
.select('id, user_id, title, category, tags, is_shared, created_at, total_time_minutes')
```

No other changes to GET logic.

### 5b. `POST /api/recipes` — extend existing

**Change:** Accept and save all four time fields. Add to body type and insert payload:

```typescript
prep_time_minutes?:     number | null
cook_time_minutes?:     number | null
total_time_minutes?:    number | null
inactive_time_minutes?: number | null
```

Validate: each field, if present, must be a non-negative integer or null.

### 5c. `PATCH /api/recipes/[id]` — extend existing

Same change: accept and save all four time fields. Add to body type and update payload builder.

### 5d. `GET /api/recipes/[id]` — no change needed

Already does `select('*')` — the new columns are returned automatically once the migration runs.

### 5e. `POST /api/recipes/search` — new route

**File:** `app/api/recipes/search/route.ts`

**Auth:** Bearer token, 401 if missing/invalid.

**Input:**
```typescript
{ query: string; filters?: RecipeFilters }
```

**Behavior:**
1. Fetch all of `auth.uid()`'s recipes: `id, title, category, tags, ingredients` (first 200 chars of ingredients).
2. Build a compact recipe list string for the LLM prompt.
3. Call the LLM (use `anthropic` from `lib/llm`) with a focused prompt:
   ```
   You are a recipe search assistant. Given a user query and a list of recipes, return a JSON array of recipe_ids ordered by relevance to the query. Only include recipes that genuinely match. If nothing matches, return [].

   Query: "${query}"

   Recipes:
   ${compactList}

   Return ONLY a JSON array of recipe_id strings, e.g. ["uuid1","uuid2"]. No other text.
   ```
4. Parse the LLM response as `string[]`.
5. **Validate:** silently drop any ID that does not appear in the user's recipe list.
6. Apply `filters` on the validated result set (same logic as client-side filtering — see §7 Business Logic §2).

**Response (always 200):**
```typescript
{ results: { recipe_id: string; recipe_title: string }[] }
```

Empty `results` array = no matches.

### 5f. `PATCH /api/recipes/bulk` — new route

**File:** `app/api/recipes/bulk/route.ts`

**Auth:** Bearer token, 401 if missing/invalid.

**Input:**
```typescript
{ recipe_ids: string[]; add_tags: string[] }
```

**Behavior:**
1. Fetch all requested recipes. If any `recipe_ids` do not belong to `auth.uid()`, return `403 { error: 'Forbidden' }`.
2. Validate all `add_tags` exist in the user's tag library (FIRST_CLASS_TAGS + `custom_tags`). If any are unknown, return `400 { error: 'Unknown tags: ...' }`.
3. For each recipe: merge `add_tags` into existing `tags` array (deduplicate, preserve order of existing tags).
4. Bulk-update in Supabase.

**Response:** `200` with `Recipe[]` (updated rows, full select).

### 5g. `POST /api/recipes/scrape` — extend existing

Add to the LLM extraction prompt (after the existing `"suggestedTags"` line):

```
- "prepTimeMinutes": prep time in minutes as an integer, or null
- "cookTimeMinutes": cook time in minutes as an integer, or null
- "totalTimeMinutes": total time in minutes as an integer, or null
- "inactiveTimeMinutes": inactive/rest/marinate time in minutes as an integer, or null
```

Add to `extracted` type and parsed output. Return in response:

```typescript
{
  ...existingFields,
  prepTimeMinutes:     number | null
  cookTimeMinutes:     number | null
  totalTimeMinutes:    number | null
  inactiveTimeMinutes: number | null
}
```

`partial: true` is **not** triggered solely by missing time fields (existing rule preserved).

---

## 6. UI Components

### File map

```
app/(app)/recipes/page.tsx                — unchanged shell (Suspense wrapper)
app/(app)/recipes/RecipePageContent.tsx   — full rewrite
app/(app)/recipes/[id]/page.tsx           — full rewrite (recipe card design)
components/recipes/RecipeGrid.tsx         — new
components/recipes/RecipeCard.tsx         — new
components/recipes/RecipeListView.tsx     — new (replaces RecipeTable for this page)
components/recipes/FilterPanel.tsx        — new
components/recipes/BulkActionBar.tsx      — new
components/recipes/BulkTagModal.tsx       — new
components/recipes/RecipeForm.tsx         — extend (add time fields)
lib/format-time.ts                        — already exists
app/api/recipes/search/route.ts           — new
app/api/recipes/bulk/route.ts             — new
```

**Do not delete** `RecipeTable.tsx` — it may be used elsewhere. The new `RecipeListView` is the list-view variant for this page only.

---

### 6a. `RecipePageContent.tsx` — full rewrite

This is the main orchestrator. Responsibilities:

- Fetch all recipes on mount via `GET /api/recipes`.
- Manage view mode (`'grid' | 'list'`), persisted in `localStorage` key `forkcast:recipe-view`.
- Manage applied filter state (`RecipeFilters`), active filter count, and filter panel open state.
- Manage search query and search results (`{ recipe_id, recipe_title }[]` or `null` when no search is active).
- Manage selection state: `Set<string>` of selected recipe IDs.
- Compute displayed recipes: start from full list, apply search results (if active), then apply filters client-side (see §7.2).
- Render:
  - Page header (title, subtitle, "+ Add Recipe" button)
  - Toolbar: search input + search icon button, Filters button with active count badge, view toggle
  - Filter panel (`FilterPanel`) — conditionally rendered
  - Active filter badges row (shown only when filters are active AND no selection)
  - Bulk action bar (`BulkActionBar`) — shown when `selection.size > 0`
  - Search result header ("X results for '…'" + "Clear search") — shown when search is active
  - `RecipeGrid` or `RecipeListView` depending on view mode
  - Loading skeleton state
  - `AddRecipeModal` (existing, unchanged)

**Search flow:**
1. User types in search box. Pressing Enter or clicking the search icon triggers the search.
2. Call `POST /api/recipes/search` with `{ query, filters: appliedFilters }`.
3. Show loading state (skeleton or spinner in grid area).
4. On response: store results, display as ordered grid/list.
5. Pressing Escape clears search and restores full list.

**Sort state** (list view only): persisted in URL query params `?sort=title&dir=asc`. Read on mount, write on sort change.

---

### 6b. `FilterPanel.tsx`

Props:
```typescript
interface FilterPanelProps {
  pendingFilters: RecipeFilters         // in-progress state (not yet applied)
  onPendingChange: (f: RecipeFilters) => void
  onApply: () => void
  onClearAll: () => void
}
```

The panel has its own internal pending state driven by `pendingFilters`. It is **not** applied live.

**Layout:**

Row 1 — tag group pill toggles (3 columns):
- **Style:** Comfort, Entertain, Favorite, Grill, One Pot, Quick, Sheet Pan, Slow Cooker, Sourdough, Soup, Spicy
- **Dietary:** Dairy-Free, Egg-Free, Gluten-Free, High-Protein, Keto, Low-Carb, Nut-Free, Paleo, Pescatarian, Vegan, Vegetarian, Whole30
- **Protein:** Beans, Beef, Chicken, Chickpeas, Eggs, Fish, Lamb, Lentils, Pork, Salmon, Sausage, Seitan, Shrimp, Tempeh, Tofu, Turkey

Dashed divider.

Row 2 — more tag groups + category (3 columns):
- **Cuisine:** American, Asian, Chinese, French, Greek, Hungarian, Indian, Irish, Italian, Japanese, Mediterranean, Mexican, Middle Eastern, Thai
- **Seasonal:** Autumn, Spring, Summer, Winter
- **Category:** Main Dish, Breakfast, Dessert, Side Dish (map to `main_dish` etc.)

Dashed divider.

Row 3 — two columns:
- **Total Time slider:** range 15–240 min, step 15, tick labels at 15 min / 1 hr / 2 hr / 4 hr+. At 240: inactive (filter off). Live label examples: "Under 30 min", "Under 1 hr", "Under 2 hr", "Under 4 hr", "Any time".
- **Last Made date range:** From / To date inputs (`type="date"`, 12px). Quick presets: "This week", "This month", "Last 3 months", "Never made". Preset → populates date inputs (except "Never made" which sets `neverMade: true` and clears dates). Editing date inputs → clears preset selection. "Never made" is mutually exclusive with From/To.

Footer: "Clear all" ghost button + "Apply filters" sage primary button.

**Tag group note:** The tags listed in the filter panel are the _default_ groupings from the brief. These are static groupings for the filter UI only — they are not enforced on the user's tag library. A recipe may have tags not in these groups; those tags are still filterable via the generic tag pills (include only tags that appear in the user's vault). Consider rendering an "Other" section for tags in the vault that don't belong to the named groups.

---

### 6c. `RecipeCard.tsx`

Props:
```typescript
interface RecipeCardProps {
  recipe: RecipeListItem & { total_time_minutes: number | null }
  selected: boolean
  onSelect: (id: string, selected: boolean) => void
  selectionMode: boolean  // true when ≥1 card is selected
}
```

Visual spec:
- Background `#FFFDF9`, border `1px solid #D4C9BA`, border-radius 4px
- Top accent bar: `3px solid` sage-500 (`#4A7C59`)
- On hover: border `#BFB2A0`
- Selected: border `2px solid #4A7C59`, sage checkmark badge in top-right

Card body (padding 1rem):
- Category label: 9px uppercase, Plus Jakarta Sans bold, sage (`#4A7C59`)
- Title: 14px Plus Jakarta Sans bold `#1F2D26`, max 2 lines, `overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical`
- Total time: 11px Manrope, muted `#8C7D6B`. Use `formatMinutes()`. Show "—" if null.
- Tags: up to 3 sage pills (10px). "+N" muted label if more.

Card footer (dashed top border, `padding: 6px 1rem`):
- Left: Last made (10px muted). "Never" if null.
- Right: Edit pencil icon → `/recipes/[id]/edit` (owner only; determine ownership by comparing `recipe.user_id` to `currentUserId` prop passed from parent)

**Click behavior:**
- Clicking anywhere on the card except the checkbox → navigate to `/recipes/[id]`
- Desktop: checkbox appears on hover in top-right. Clicking checkbox (not the card body) selects.
- Mobile: 500ms long press → enter selection mode + optional haptic (`navigator.vibrate(10)` if supported). Subsequent taps toggle.

---

### 6d. `RecipeGrid.tsx`

Props:
```typescript
interface RecipeGridProps {
  recipes: RecipeListItem[]
  selectedIds: Set<string>
  onSelect: (id: string, selected: boolean) => void
  currentUserId: string | undefined
  loading?: boolean
}
```

Grid: `grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3`

When `loading`: render 8 skeleton cards (gray pulse rectangles at the same grid dimensions).

When `recipes` is empty (and not loading): "No recipes found" empty state.

---

### 6e. `RecipeListView.tsx`

Props:
```typescript
interface RecipeListViewProps {
  recipes: RecipeListItem[]
  selectedIds: Set<string>
  onSelect: (id: string, selected: boolean) => void
  onSelectAll: (selected: boolean) => void
  sortKey: ListSortKey
  sortDir: 'asc' | 'desc' | null
  onSort: (key: ListSortKey) => void
  currentUserId: string | undefined
}

export type ListSortKey = 'title' | 'category' | 'total_time_minutes' | 'last_made' | null
```

Columns: ☐ | Recipe (sortable) | Category (sortable) | Tags | Total Time (sortable) | Last Made (sortable) | Edit

Sort behavior: first click = asc, second = desc, third = clear (null). Show arrow indicator on active column.

Default sort (from URL or none): `created_at` descending (i.e. the order from `GET /api/recipes` which already sorts newest first — when sortKey is null, preserve API order).

Sort state is read from URL params `?sort=title&dir=asc` and written on change. On third click (clear), remove params from URL.

---

### 6f. `BulkActionBar.tsx`

Props:
```typescript
interface BulkActionBarProps {
  count: number
  onAddTags: () => void
  onDelete: () => void
  onCancel: () => void
}
```

Background `#1F2D26`, sticky at bottom of viewport (or top of content area — position as natural in the layout below the toolbar).
Left: "{N} recipe{s} selected"
Right: "+ Add tags" (ghost sage), "Delete" (terracotta), "Cancel" (ghost muted)

---

### 6g. `BulkTagModal.tsx`

Opens as a modal overlay. Uses existing `TagSelector` component.

Props:
```typescript
interface BulkTagModalProps {
  selectedCount: number
  onConfirm: (tags: string[]) => Promise<void>
  onClose: () => void
}
```

Shows a `TagSelector` with `selected={[]}` (no pre-selection). On confirm, calls `PATCH /api/recipes/bulk` via the parent. Shows a loading state during the request.

---

### 6h. Recipe Detail Page — `app/(app)/recipes/[id]/page.tsx` — full rewrite

Redesign the existing detail page to match the recipe card visual spec.

**Keep all existing functionality:**
- `InlineTagEditor` (owner only) / tag pill display (non-owner)
- `LogDateSection` and "Log Made Today" button
- `ShareToggle` (owner only)
- `DeleteConfirmDialog`
- Edit button → `/recipes/[id]/edit`

**New visual structure** (wrapping card, max-width 680px, centered, bg `#F7F4F0`):

```
┌──────────────────────────────────────────┐  ← card: bg #FFFDF9, border #D4C9BA, r-4
│ ▇ top accent (5px solid sage-500)        │
│                                          │
│  MAIN DISH          ← 10px uppercase     │
│  Recipe Title       ← 22px bold         │
│  Prep · Cook · Total · Inactive          │
│  ─────────────────── dashed divider ──── │
│  [tag pills row]                         │
│  ─────────────────── dashed divider ──── │
│  INGREDIENTS  │  STEPS                   │
│  (left col)   │  (right col)             │
│               │  ┬ numbered circle steps │
│  ─────────────────── dashed divider ──── │
│  Notes (if present, italic muted)        │
│  ─────────────────── dashed divider ──── │
│  Last made X · N×   [Edit] [Log] [Del]  │
│  View original recipe →                  │
│  Share toggle                            │
└──────────────────────────────────────────┘
```

**Times row:** Each of Prep / Cook / Total / Inactive: 10px uppercase muted label + 13px Plus Jakarta Sans value using `formatMinutes()`. Show "—" if null.

**Two-column body:** `grid grid-cols-2 gap-4 divided-x` with a dashed vertical divider (`border-r border-dashed border-[#D4C9BA]` on the left column).

**Step numbering:** Each step gets a numbered circle (20px diameter, sage bg, white text, Plus Jakarta Sans bold) + step text (13px Manrope, `#3D3028`, leading-relaxed).

**Notes:** Only rendered if `recipe.notes` is non-empty. 13px Manrope italic, muted.

**Footer:** `last_made` date + `times_made` count. "Never made" if zero history.

**Back link:** "← All Recipes" at top of page (outside the card), links to `/recipes`.

---

### 6i. `RecipeForm.tsx` — extend

Add four number inputs in a 2×2 grid after the Category field (before Tags):

```
┌───────────────────┬──────────────────┐
│ Prep time (min)   │ Cook time (min)  │
├───────────────────┼──────────────────┤
│ Total time (min)  │ Inactive (min)   │
└───────────────────┴──────────────────┘
```

All optional, `type="number"`, `min={0}`, `step={1}`. Helper text below group: "Enter time in minutes".

Add to `RecipeFormValues`:
```typescript
prep_time_minutes:      number | ''
cook_time_minutes:      number | ''
total_time_minutes:     number | ''
inactive_time_minutes:  number | ''
```

(Use `''` as the empty/unset state for controlled number inputs; convert to `null` on submit.)

The pages that use `RecipeForm` (`AddRecipeModal`, `/recipes/[id]/edit/page.tsx`) must also pass the new time field initial values from the scrape response and the existing recipe respectively.

---

## 7. Business Logic

### 7.1 Filter application (client-side)

Given the full recipe list and `appliedFilters: RecipeFilters`, compute displayed recipes as:

1. **Tag filter (AND):** if `filters.tags.length > 0`, keep only recipes where every tag in `filters.tags` is present in `recipe.tags`.
2. **Category filter:** if `filters.categories.length > 0`, keep only recipes matching one of the selected categories.
3. **Total time filter:** if `filters.maxTotalMinutes !== null` AND `filters.maxTotalMinutes < 240`, keep only recipes where `recipe.total_time_minutes !== null && recipe.total_time_minutes <= filters.maxTotalMinutes`.
4. **Never made:** if `filters.neverMade`, keep only recipes where `recipe.last_made === null`.
5. **Last made date range:** if `filters.lastMadeFrom` or `filters.lastMadeTo`, filter by `recipe.last_made` within the range (inclusive). If `recipe.last_made` is null, exclude it.

Filters compose with AND logic across groups.

### 7.2 Search + filter composition

When a search is active:
- The ordered `results[]` from `POST /api/recipes/search` defines the candidate set.
- Apply active filters client-side on top of that candidate set.
- Preserve the LLM's relevance ordering.

### 7.3 Filter panel state machine

- "Pending" state lives in `FilterPanel` (or lifted to `RecipePageContent` as `pendingFilters`).
- "Applied" state only updates when "Apply filters" is clicked.
- Active filter count badge = count of active dimensions in **applied** state:
  - 1 point per tag in `appliedFilters.tags`
  - 1 point if `appliedFilters.categories.length > 0`
  - 1 point if `maxTotalMinutes` is active (< 240)
  - 1 point if `neverMade` or either date is set
- "Clear all" in active badges row: clears applied filters + pending filters + re-runs display.

### 7.4 "Never made" + date range mutual exclusion

- Selecting "Never made" preset: sets `neverMade: true`, clears `lastMadeFrom` and `lastMadeTo`.
- Editing `lastMadeFrom` or `lastMadeTo`: clears `neverMade: false`.

### 7.5 Sort (list view) — three-click cycle

`null → 'asc' → 'desc' → null`. On `null`, order is the API default (created_at desc). URL params cleared when sort is null.

### 7.6 Bulk delete

Always show `DeleteConfirmDialog` (or equivalent inline dialog) with message: `"Delete {N} recipe{s}? This can't be undone."` Call `DELETE /api/recipes/[id]` for each selected recipe sequentially (or in parallel). Refresh the recipe list on completion.

### 7.7 View preference persistence

`localStorage.setItem('forkcast:recipe-view', view)` on toggle. Read on mount; default to `'grid'` if absent.

### 7.8 Mobile selection mode

- Long press (500ms via `setTimeout` cleared on `pointerup`): enter selection mode. Call `navigator.vibrate(10)` if supported.
- Once in selection mode: taps toggle selection. A tap on the page background outside all cards exits selection mode (clears selection).

---

## 8. Test Cases

All 44 test cases from the brief must be covered. Key ones requiring unit tests:

**`lib/__tests__/format-time.test.ts`** (already exists — verify it passes):
- T38: `formatMinutes(null)` → `'—'`
- T39: `formatMinutes(45)` → `'45 min'`
- T40: `formatMinutes(60)` → `'1 hr'`
- T41: `formatMinutes(90)` → `'1 hr 30 min'`

**`app/api/recipes/search/__tests__/search.test.ts`** (new):
- T15: Returns relevant results for a valid query
- T16: `filters` parameter is applied server-side
- T18: Returns `{ results: [] }` when LLM returns no matching IDs
- Validates: IDs not in user's recipe list are silently dropped (security)
- Returns 401 for unauthenticated request

**`app/api/recipes/bulk/__tests__/bulk.test.ts`** (new):
- T42: Returns 403 when any `recipe_id` belongs to a different user
- T43: Returns 400 when any `add_tags` entry is not in the user's tag library
- T23: Tags are merged additively — existing tags preserved, duplicates removed
- T22: Returns 200 with updated `Recipe[]` on success
- Returns 401 for unauthenticated request

**`app/api/recipes/__tests__/recipes.test.ts`** (extend existing):
- T44: `GET /api/recipes` includes `total_time_minutes` in response items
- T36: `POST /api/recipes` saves all four time fields
- T37: `PATCH /api/recipes/[id]` updates time fields

**Component tests** (use React Testing Library or equivalent pattern already in repo):
- T01–T03: View toggle, default grid, localStorage persistence
- T04–T06: Filter panel open/close, tag filter application, AND logic
- T08–T09: Time slider inactive at max; filters recipes at 30 min
- T10, T12: "Never made" preset; mutual exclusion with date inputs
- T13–T14: "Clear all" and active filter count
- T19–T21: Card selection, bulk bar appearance, count display
- T24–T26: Bulk delete confirmation, cancel
- T27–T30: List view columns, sort cycle, URL persistence
- T31–T34: Detail page card design, times row, two-column layout, notes hidden

---

## 9. Out of Scope

Per brief §8 — do not implement:
- Recipe rating / starring
- Nutritional information
- Serving size scaling on detail page
- Print view / PDF export
- Image upload (scraped URLs only)
- Full-text ingredient/notes search (AI search covers semantically)
- Pagination
- Drag-to-reorder
- Recipe collections / folders

---

## 10. Implementation Notes for the Writer

1. **Existing components to keep:** `TagPill`, `LogMadeTodayButton`, `ShareToggle`, `LogDateSection`, `DeleteConfirmDialog`, `InlineTagEditor`, `TagSelector`, `AddRecipeModal`, `RecipeTable` (preserved, not deleted). Reuse wherever possible.

2. **Existing `RecipeFilters.tsx` and `TagFilterBar.tsx`:** These existing components implement the _old_ filter UI. They are superseded by the new `FilterPanel.tsx` in `RecipePageContent`. The old files should remain (do not delete) but are no longer rendered in `RecipePageContent`.

3. **`RecipePageContent.tsx`** is a Client Component (`'use client'`) and will grow significantly. Keep state management clean — consider extracting filter logic into a custom hook (`useRecipeFilters`) if it aids clarity, but only if that hook is actually needed by the component.

4. **AI search LLM call:** Use the `anthropic` client from `lib/llm` with `claude-haiku-4-5-20251001` model (same as scrape route) for cost efficiency. Max tokens: 512. Temperature: 0.

5. **Color tokens (Tailwind):** Use the existing design system class names established in Brief 11's design system PR (`sage-500`, `stone-*`, `terra-*`, etc.). If these aren't in the Tailwind config, fall back to inline hex values matching the brief: sage `#4A7C59`, terracotta `#B85C38`, muted `#8C7D6B`, dark forest `#1F2D26`.

6. **`RecipeFormValues` change:** Adding time fields to the form interface may affect the existing edit page (`/recipes/[id]/edit/page.tsx`). Update its `onSubmit` handler to include the new fields in the `PATCH` body.

7. **Scrape → form pre-fill:** The `AddRecipeModal` passes scraped data to `RecipeForm` as `initialValues`. Extend this flow to include the four new time fields from the scrape response.

---

Awaiting owner approval before Writer proceeds.
