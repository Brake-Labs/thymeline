# Brief 11 — Recipe Dashboard & Card Redesign

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/recipe-dashboard`
**Target:** PR into `staging`
**Depends on:** Briefs 01–07 merged to staging

---

## User Story

As a Forkcast user, I want my recipe vault to feel like a real recipe box — beautiful
index cards I can browse, filter, and search — so finding the right recipe is fast
and satisfying. I also want the recipe detail page to feel like a physical recipe
card: elegant, readable, and branded.

---

## 1. Recipe Dashboard (`/recipes`)

### Layout

Replace the existing table with a card grid. Add a list view toggle. Default: card grid.

**Page header:**
- Title: "Recipe Vault" (Plus Jakarta Sans, 22px, bold, `#1F2D26`)
- Subtitle: "{N} recipes" (Manrope, 13px, muted)
- Right: "+ Add Recipe" button (sage primary)

**Toolbar:**
- Search input (full width, see §AI Search)
- Filter toggle button showing active filter count with terracotta dot indicator
- View toggle: grid icon / list icon (two-button toggle, active state `bg-sage-100 text-sage-700`)

**Active filter badges:**
- Shown below toolbar only when filters are active
- Each active filter as a removable sage pill
- "Clear all" link in terracotta

**Filter panel** (collapsible, hidden by default, expands below toolbar):
- See §Filter Panel

**Card grid / list view:**
- See §Card Grid and §List View

**Bulk action bar** (replaces active filter badges row when any recipe is selected):
- Dark forest background (`#1F2D26`)
- Left: "{N} recipes selected"
- Right: "+ Add tags" button (ghost sage), "Delete" button (terracotta), "Cancel" button (ghost muted)
- Confirmation dialog before bulk delete: "Delete {N} recipes? This can't be undone."

---

### Filter Panel

Collapsible. Hidden by default. Expands when "Filters" button is clicked.
Background `#FFFDF9`, border `1px solid #D4C9BA`, border-radius 6px.

**Tag groups (pill toggles, multi-select, AND logic):**

Row 1 — three columns:
- Style: Comfort, Entertain, Favorite, Grill, One Pot, Quick, Sheet Pan, Slow Cooker, Sourdough, Soup, Spicy
- Dietary: Dairy-Free, Egg-Free, Gluten-Free, High-Protein, Keto, Low-Carb, Nut-Free, Paleo, Pescatarian, Vegan, Vegetarian, Whole30
- Protein: Beans, Beef, Chicken, Chickpeas, Eggs, Fish, Lamb, Lentils, Pork, Salmon, Sausage, Seitan, Shrimp, Tempeh, Tofu, Turkey

Row 2 — three columns (separated by dashed divider):
- Cuisine: American, Asian, Chinese, French, Greek, Hungarian, Indian, Irish, Italian, Japanese, Mediterranean, Mexican, Middle Eastern, Thai
- Seasonal: Autumn, Spring, Summer, Winter
- Category: Main Dish, Breakfast, Dessert, Side Dish (pill toggles, same style)

Row 3 — two columns (separated by dashed divider):
- **Total Time slider:**
  - Range: 15 min – 4 hr (240 min), step 15 min
  - Live label: "Under 30 min" / "Under 1 hr" / "Under 2 hr" / "Under 4 hr" / "Any time"
  - Sub-label: "Showing recipes up to X"
  - Tick labels at 15 min, 1 hr, 2 hr, 4 hr+
  - At max value (240): filter is inactive (show all)

- **Last Made date range:**
  - Two date inputs: From / To with "→" separator
  - Font size: 12px
  - On click: native browser date picker (`type="date"`)
  - Quick presets below inputs (pill toggles): "This week", "This month", "Last 3 months", "Never made"
  - Selecting a preset populates the date inputs; editing inputs clears the preset selection
  - "Never made" preset: special case — filters to recipes with no `recipe_history` entries

**Footer:** "Clear all" (ghost) + "Apply filters" (sage primary)

**Filter state:** filters are applied only on "Apply filters" click, not live. Active count in the toolbar button reflects applied filters, not in-progress selections.

---

### AI-Powered Search

Free text search using the LLM to find recipes semantically.

**Behavior:**
1. User types in the search box and presses Enter or clicks a search icon
2. Call `POST /api/recipes/search` with `{ query: string }`
3. Server fetches user's full recipe list (id, title, tags, category, ingredients snippet)
4. LLM matches the query to the most relevant recipes and returns ordered `recipe_id[]`
5. Results replace the current card/list view, ordered by relevance
6. Show "X results for '[query]'" above the grid with a "Clear search" link
7. While searching: show a subtle loading state (skeleton cards or spinner)
8. No results: "No recipes found for '[query]'" with a "Clear search" link

**Search input behavior:**
- Placeholder: "Search recipes or try 'something Italian with chicken'…"
- Pressing Escape clears the search and restores the full list
- Search results respect active tag/category/time/date filters (filters apply on top of search results)

**`POST /api/recipes/search`:**

Input:
```typescript
{ query: string, filters?: RecipeFilters }
```

Behavior:
1. Fetch user's recipes (title, tags, category, ingredients — first 200 chars)
2. Pass to LLM with a short focused prompt:
   - "Return recipe_ids ordered by relevance to the query. Return only IDs that match. If nothing matches, return []."
3. Validate all returned IDs exist in the user's recipes
4. Return ordered list

Response:
```typescript
{ results: { recipe_id: string, recipe_title: string }[] }
```

Always returns 200. Empty array = no matches.

---

### Card Grid

Grid: `repeat(auto-fill, minmax(190px, 1fr))`, gap 12px.

**Each recipe card:**
- Top accent bar: 3px solid sage-500
- Background: `#FFFDF9`
- Border: `1px solid #D4C9BA`, border-radius 4px
- On hover: border-color darkens slightly (`#BFB2A0`)

**Card body (padding 1rem):**
- Category label: 9px, uppercase, sage, Plus Jakarta Sans bold
- Recipe title: 14px, Plus Jakarta Sans bold, `#1F2D26`, max 2 lines then ellipsis
- Total time: 11px, Manrope, muted (`#8C7D6B`). Show "—" if null.
- Tags: up to 3 sage pills (10px). "+N" muted label if more.

**Card footer** (dashed top border, padding 6px 1rem):
- Left: Last made date (10px, muted). "Never" if no history.
- Right: Edit pencil icon button (links to `/recipes/[id]/edit`, owner only)

**Selection behavior:**
- Desktop: checkbox appears in top-right corner of card on hover; clicking checkbox selects
- Mobile: long press (500ms) enters selection mode; subsequent taps toggle selection
- Selected state: `border: 2px solid #4A7C59`, sage checkmark badge replaces checkbox
- When any card is selected: bulk action bar appears, filter badges hidden

**Clicking a card** (not the checkbox): navigates to `/recipes/[id]`

---

### List View

Sortable table. Same selection behavior as card grid (checkbox column on left).

**Columns:**

| Column | Sortable | Notes |
|---|---|---|
| ☐ | — | Checkbox (select all in header) |
| Recipe | ✓ | Title linked to `/recipes/[id]` |
| Category | ✓ | Readable label |
| Tags | — | Up to 3 pills, "+N more" |
| Total Time | ✓ | Formatted (e.g. "45 min", "2 hr") |
| Last Made | ✓ | "Never" fallback |
| — | — | Edit pencil icon (owner only) |

**Sort:** click column header to sort ascending; click again for descending; third click clears sort. Show sort arrow indicator on active column.

**Default sort:** created_at descending (newest first).

---

## 2. Recipe Detail Page Redesign

Replace the current detail page with the recipe card design.

### Visual Design

- Page background: `#F7F4F0`
- Card background: `#FFFDF9`
- Card border: `1px solid #D4C9BA`, border-radius 4px
- Top accent bar: 5px solid sage-500
- Internal dividers: `1px dashed #D4C9BA`
- Max width: 680px, centered

### Header section (above first dashed divider)

- Category: 10px uppercase sage label, Plus Jakarta Sans bold, letter-spacing 0.12em
- Title: 22px Plus Jakarta Sans bold, `#1F2D26`
- Times row: Prep · Cook · Total · Inactive
  - Each: 10px uppercase muted label + 13px Plus Jakarta Sans value
  - Use `formatMinutes()` helper (see §Time Fields)
  - Show "—" if null

### Tags row (between header and body)

- All tags same style: sage filled pills (`background: #D9EBE0`, `color: #3D6849`, border-radius 20px, 11px Manrope)
- No color distinction between tag groups

### Body (two-column grid, separated by dashed vertical border)

**Left — Ingredients:**
- Section label: 10px uppercase sage, Plus Jakarta Sans bold
- Each ingredient: 13px Manrope, `#3D3028`, bottom border `1px solid #EDE6DC`
- Last ingredient: no bottom border

**Right — Steps:**
- Section label: 10px uppercase sage, Plus Jakarta Sans bold
- Each step: numbered circle (20px diameter, sage background, white Plus Jakarta Sans text) + step text (13px Manrope, `#3D3028`, line-height 1.5)

### Notes (full width, below body, above footer)

- Only shown if notes exist
- 13px Manrope, muted color, italic
- Separated by dashed divider above

### Footer

- Left: "Last made [date] · [N]×" (11px Manrope, muted). "Never made" if no history.
- Left also: "View original recipe →" link if source URL exists (11px, sage)
- Right (owner only): Edit button (ghost sage), Log Made Today button (sage primary), Delete button (ghost terracotta)
- Share toggle: "Share with community" toggle, owner only, below footer or inline

---

## 3. Time Fields

### DB Migration (`012_recipe_time_fields.sql`)

```sql
alter table recipes
  add column if not exists prep_time_minutes  int,
  add column if not exists cook_time_minutes   int,
  add column if not exists total_time_minutes  int,
  add column if not exists inactive_time_minutes int;
```

### TypeScript (`types/index.ts`)

Add to `Recipe`:
```typescript
prep_time_minutes:      number | null
cook_time_minutes:      number | null
total_time_minutes:     number | null
inactive_time_minutes:  number | null
```

### `lib/format-time.ts`

```typescript
export function formatMinutes(minutes: number | null): string {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}
```

### API updates

`POST /api/recipes` and `PATCH /api/recipes/[id]`: accept and save all four time fields.

`GET /api/recipes/[id]`: return all four time fields.

`GET /api/recipes`: include `total_time_minutes` in list response (needed for card display and sorting).

### Scrape API update (`app/api/recipes/scrape/route.ts`)

Add to LLM extraction prompt:
```
- "prepTimeMinutes": prep time in minutes as an integer, or null
- "cookTimeMinutes": cook time in minutes as an integer, or null
- "totalTimeMinutes": total time in minutes as an integer, or null
- "inactiveTimeMinutes": inactive/rest/marinate time in minutes as an integer, or null
```

Return in scrape response. `partial: true` is not triggered solely by missing time fields.

### Recipe form

Add four number inputs to `RecipeForm.tsx` in a 2×2 grid:
- Prep time (min), Cook time (min), Total time (min), Inactive time (min)
- All optional, integer, min 0
- Helper text: "Enter time in minutes"

---

## 4. Bulk Tag Assignment

When "+ Add tags" is clicked in the bulk action bar:

- Opens a modal with `TagSelector` showing the full tag library
- User selects tags to add
- On confirm: `PATCH /api/recipes/bulk` with `{ recipe_ids: string[], add_tags: string[] }`
- Tags are merged with existing tags on each recipe (not replaced)
- Return 200 with updated recipes

### `PATCH /api/recipes/bulk`

Input:
```typescript
{
  recipe_ids: string[]
  add_tags:   string[]
}
```

Behavior:
1. Verify all recipe_ids belong to `auth.uid()`. Return 403 for any non-owned recipe.
2. Validate all tags exist in user's tag library. Return 400 for unknown tags.
3. For each recipe: merge `add_tags` into existing `tags` array (deduplicated).
4. Return updated recipes.

Response: `200` with `Recipe[]`

---

## 5. Component / File Structure

```
app/(app)/recipes/page.tsx               — updated: card grid + list + filters + search
components/recipes/RecipeGrid.tsx        — new: card grid view
components/recipes/RecipeCard.tsx        — new: individual recipe card
components/recipes/RecipeListView.tsx    — new: sortable list/table view (replaces RecipeTable)
components/recipes/FilterPanel.tsx       — new: collapsible filter panel
components/recipes/BulkActionBar.tsx     — new: bulk selection action bar
components/recipes/BulkTagModal.tsx      — new: tag assignment modal for bulk action
components/recipes/[id]/page.tsx         — updated: new card design
lib/format-time.ts                       — new: formatMinutes helper
app/api/recipes/search/route.ts          — new: AI search endpoint
app/api/recipes/bulk/route.ts            — new: bulk tag assignment
supabase/migrations/012_recipe_time_fields.sql  — new
```

---

## 6. Business Logic

1. **Filters are applied on "Apply" click** — not live. The filter panel's internal state is independent from the applied state until Apply is clicked.

2. **Search + filters compose** — search results are further filtered by any active tag/category/time/date filters. If both are active, both must match.

3. **Total time filter at max (240 min) = inactive** — don't filter by time when the slider is at its maximum value.

4. **"Never made" preset** — filters to recipes with zero entries in `recipe_history` for the current user. Mutually exclusive with the date range inputs (selecting "Never made" clears From/To; editing date inputs clears "Never made").

5. **Long press selection on mobile** — 500ms hold enters selection mode. A subtle haptic feedback (if supported) confirms entry into selection mode. Once in selection mode, taps toggle selection; a tap outside all cards exits selection mode.

6. **Bulk delete confirmation** — always show a confirmation dialog before bulk delete. Message: "Delete {N} recipe{s}? This can't be undone."

7. **Bulk tag add is additive** — never replaces existing tags. A recipe with ["Chicken", "Quick"] that gets "Comfort" bulk-added becomes ["Chicken", "Quick", "Comfort"].

8. **`POST /api/recipes/search` only searches the current user's recipes** — shared recipes from other users are not included.

9. **AI search validates IDs** — any recipe_id returned by the LLM that doesn't exist in the user's recipe list is silently dropped.

10. **View preference persisted** — store the user's last selected view (grid/list) in `localStorage` so it persists across sessions.

11. **Sort state** — persisted in URL query params (`?sort=title&dir=asc`) so it survives page refresh and can be shared.

---

## 7. Test Cases

| # | Test case |
|---|---|
| T01 | Recipe vault loads in card grid by default |
| T02 | View toggle switches between grid and list |
| T03 | View preference persists across page reload |
| T04 | Filter panel hidden by default; expands on "Filters" click |
| T05 | Selecting a tag filter and clicking Apply filters the grid |
| T06 | Multiple tag filters use AND logic |
| T07 | Category filter returns only matching category |
| T08 | Total Time slider at max shows all recipes |
| T09 | Total Time slider at 30 min hides recipes over 30 min |
| T10 | Last Made "Never made" preset filters to never-made recipes |
| T11 | Last Made date range filters correctly |
| T12 | Selecting a preset clears the date inputs and vice versa |
| T13 | "Clear all" resets all filters |
| T14 | Active filter count shown on Filters button |
| T15 | AI search returns relevant results for "something Italian with chicken" |
| T16 | Search + active filters compose correctly |
| T17 | "Clear search" restores full list |
| T18 | No results state shown when search returns empty |
| T19 | Desktop: checkbox appears on card hover; clicking selects it |
| T20 | Selecting a card shows bulk action bar |
| T21 | Bulk action bar shows correct selected count |
| T22 | "+ Add tags" opens tag modal; confirming adds tags to all selected recipes |
| T23 | Bulk tag add is additive — does not remove existing tags |
| T24 | Bulk delete shows confirmation dialog |
| T25 | Confirming bulk delete removes selected recipes and refreshes grid |
| T26 | "Cancel" in bulk bar deselects all and hides bar |
| T27 | List view renders all columns correctly |
| T28 | Clicking a sortable column header sorts ascending |
| T29 | Clicking again sorts descending; third click clears sort |
| T30 | Sort state persists in URL query params |
| T31 | Recipe detail page renders card design with top accent bar |
| T32 | Times row shows formatted times; "—" for null fields |
| T33 | Two-column body renders ingredients left, steps right |
| T34 | Notes section hidden when no notes |
| T35 | Scrape extracts time fields and pre-fills form |
| T36 | Time fields save on POST /api/recipes |
| T37 | Time fields update on PATCH /api/recipes/[id] |
| T38 | formatMinutes(null) returns "—" |
| T39 | formatMinutes(45) returns "45 min" |
| T40 | formatMinutes(60) returns "1 hr" |
| T41 | formatMinutes(90) returns "1 hr 30 min" |
| T42 | PATCH /api/recipes/bulk returns 403 for non-owned recipe |
| T43 | PATCH /api/recipes/bulk returns 400 for unknown tag |
| T44 | GET /api/recipes includes total_time_minutes in list response |

---

## 8. Out of Scope

- Recipe rating / starring system
- Nutritional information
- Serving size scaling on the detail page
- Print view / PDF export of recipe card
- Image upload (scraped image URLs only)
- Full text search of ingredients and notes (AI search covers this semantically)
- Pagination (client-side filtering handles performance for typical vault sizes)
- Drag to reorder recipes
- Recipe collections / folders
