# Technical Spec — Brief 02: Recipe Vault

**Spec status:** Draft — Awaiting owner approval before Writer proceeds.
**Branch:** `feature/recipe-vault` from `staging`
**Depends on:** `feature/scaffold` merged to `staging`

---

## 1. Summary

Build the Recipe Vault: the core CRUD surface of Forkcast. Users can add recipes by URL (scraped + LLM-extracted) or manually, browse their library in a sortable/filterable table, view a full detail page, log cook history, and toggle sharing. This feature establishes the data foundation that meal planning (future briefs) will build on.

---

## 2. DB Changes

### 2a. Alter `recipes` table
```sql
alter table recipes
  add column is_shared    bool    default false,
  add column ingredients  text,
  add column steps        text,
  add column image_url    text;
```

### 2b. Unique constraint on `recipe_history`
Prevent duplicate log entries for the same recipe on the same day:
```sql
alter table recipe_history
  add constraint recipe_history_unique_day
  unique (recipe_id, user_id, made_on);
```

### 2c. RLS policies

```sql
-- Enable RLS on both tables
alter table recipes        enable row level security;
alter table recipe_history enable row level security;

-- Owners have full access to their own recipes
create policy "owner full access"
  on recipes for all
  using (auth.uid() = user_id);

-- Any authenticated user can read shared recipes
create policy "read shared recipes"
  on recipes for select
  using (is_shared = true);

-- Owners have full access to their own history
create policy "owner history access"
  on recipe_history for all
  using (auth.uid() = user_id);
```

### 2d. Update TypeScript types in `types/index.ts`
Add the four new fields to the existing `Recipe` interface:
```typescript
is_shared:   boolean
ingredients: string | null
steps:       string | null
image_url:   string | null
```

Add a new `RecipeHistory` interface if not already present:
```typescript
export interface RecipeHistory {
  id:         string
  recipe_id:  string
  user_id:    string
  made_on:    string   // ISO date "YYYY-MM-DD"
  created_at: string
}
```

### 2e. New env var
Add to `.env.local.example`:
```
FIRECRAWL_API_KEY=
```
The scrape route requires this key. Fail fast with a 500 if it is missing at request time.

---

## 3. API Routes

All routes require an authenticated Supabase session (check via `supabase.auth.getUser()`). Return `401` if no session.

---

### `POST /api/recipes/scrape`

**Purpose:** Fetch a URL and extract recipe data via Firecrawl + LLM.

**Input:**
```typescript
{ url: string }  // validated: must be a non-empty string parseable as a URL
```

**Behavior:**
1. Call Firecrawl (`firecrawl` npm package) with the provided URL to fetch raw page markdown/text. Use `FIRECRAWL_API_KEY`.
2. Pass the raw content to the LLM (`lib/llm.ts`) with a structured extraction prompt. Ask the LLM to return JSON with: `title`, `ingredients` (newline-separated string), `steps` (newline-separated string, plain text not numbered — numbering is a display concern), `imageUrl`.
3. If a field cannot be extracted, set it to `null` in the response.
4. Determine `partial: true` if any of `title`, `ingredients`, or `steps` is `null` (imageUrl missing does not count as partial).
5. Always return 200 — never throw on partial extraction.

**Response:**
```typescript
{
  title:       string | null
  ingredients: string | null   // newline-separated
  steps:       string | null   // newline-separated
  imageUrl:    string | null
  sourceUrl:   string          // always the original input URL
  partial:     boolean
}
```

**Errors:**
- `400` — `url` missing or not a valid URL
- `500` — Firecrawl or LLM call throws unexpectedly (log and surface generic message)

---

### `GET /api/recipes`

**Purpose:** List all recipes the current user can see.

**Query params:**
| Param | Type | Notes |
|---|---|---|
| `category` | string | Filter by exact category value |
| `tag` | string | Filter: recipes whose `tags` array contains this value |

**Behavior:**
1. Fetch the current user's own recipes AND all recipes where `is_shared = true` (Supabase RLS will enforce this; write the query so it naturally returns both).
2. For each recipe, join `recipe_history` to find the most recent `made_on` date and total count of history entries. Return as `last_made` (ISO date string or `null`) and `times_made` (int).
3. Apply `category` and/or `tag` filters if present.
4. Order by `created_at` descending by default (client-side sort handles re-ordering).

**Response:**
```typescript
RecipeListItem[]

interface RecipeListItem {
  id:         string
  user_id:    string
  title:      string
  category:   'main_dish' | 'breakfast' | 'dessert' | 'side_dish'
  tags:       string[]
  is_shared:  boolean
  last_made:  string | null  // "YYYY-MM-DD"
  times_made: number
  created_at: string
}
```
Note: `ingredients`, `steps`, `image_url`, `notes` are NOT included in the list response — fetch the full record on the detail page.

---

### `POST /api/recipes`

**Purpose:** Create a new recipe.

**Input:**
```typescript
{
  title:       string          // required
  category:    'main_dish' | 'breakfast' | 'dessert' | 'side_dish'  // required
  tags:        string[]        // must all exist in user's user_tags; empty array OK
  ingredients: string | null
  steps:       string | null
  notes:       string | null
  url:         string | null   // source URL
  image_url:   string | null
}
```

**Behavior:**
1. Validate all required fields.
2. Validate that every tag in `tags` exists in `user_tags` for the current user. Return `400` with a message listing unknown tags if any are invalid.
3. Insert into `recipes` with `user_id = auth.uid()` and `is_shared = false`.
4. Return the full created record.

**Response:** `201` with the full `Recipe` object.

---

### `GET /api/recipes/[id]`

**Purpose:** Fetch a single recipe's full data.

**Behavior:**
1. Fetch recipe by `id` where `user_id = auth.uid()` OR `is_shared = true` (RLS handles this; write the query accordingly).
2. Join `recipe_history` for `last_made` and `times_made`.
3. Return `404` if not found or not accessible.

**Response:**
```typescript
Recipe & {
  last_made:  string | null
  times_made: number
}
```

---

### `PATCH /api/recipes/[id]`

**Purpose:** Update a recipe. Owner only.

**Input:** Partial of the `POST /api/recipes` body — any subset of fields.

**Behavior:**
1. Verify `user_id = auth.uid()` on the recipe. Return `403` if not owner.
2. Validate tags (same rule as POST) if `tags` is present in the payload.
3. Update only fields present in the payload.

**Response:** `200` with the full updated `Recipe` object.

---

### `DELETE /api/recipes/[id]`

**Purpose:** Delete a recipe. Owner only.

**Behavior:**
1. Verify `user_id = auth.uid()`. Return `403` if not owner.
2. Delete the recipe (cascade handles `recipe_history` and `meal_plan_entries`).

**Response:** `204` no content.

---

### `POST /api/recipes/[id]/log`

**Purpose:** Log that the current user made this recipe today.

**Behavior:**
1. Verify the recipe exists and the user can access it (`user_id = auth.uid()` OR `is_shared = true`).
2. Attempt to insert `{ recipe_id, user_id: auth.uid(), made_on: today }` into `recipe_history`.
3. If the unique constraint fires (duplicate for today), return `200` silently — treat as idempotent, not an error.

**Response:** `200` with `{ made_on: "YYYY-MM-DD", already_logged: boolean }`.

---

### `PATCH /api/recipes/[id]/share`

**Purpose:** Toggle `is_shared`. Owner only.

**Input:** `{ is_shared: boolean }`

**Behavior:**
1. Verify `user_id = auth.uid()`. Return `403` if not owner.
2. Set `is_shared` to the provided value.

**Response:** `200` with the updated `Recipe` object.

---

### `GET /api/tags`

**Purpose:** Return the current user's full tag library (needed by forms and filters).

**Response:**
```typescript
interface UserTag {
  id:   string
  name: string
}

UserTag[]
```

---

## 4. UI Components

All in TypeScript. All styled with Tailwind only — no inline styles, no external CSS.

### Pages / Routes

| Route | Component file | Notes |
|---|---|---|
| `/recipes` | `app/(app)/recipes/page.tsx` | Recipe list |
| `/recipes/[id]` | `app/(app)/recipes/[id]/page.tsx` | Recipe detail |
| `/recipes/[id]/edit` | `app/(app)/recipes/[id]/edit/page.tsx` | Edit form (reuses RecipeForm) |

---

### Component List

**`components/recipes/RecipeTable.tsx`**
- Renders the sortable table
- Props: `recipes: RecipeListItem[]`, `onSort`, current sort state
- Columns: Name (link to detail), Category (readable label), Tags (pills, max 3 visible + "+N more"), Last Made ("Never" fallback)
- Client component (handles sort state locally)

**`components/recipes/RecipeFilters.tsx`**
- Two dropdowns: Category, Tag
- Category options: All, Main Dish, Breakfast, Dessert, Side Dish
- Tag options: loaded from `GET /api/tags`
- On change, updates query params and re-fetches list

**`components/recipes/TagPill.tsx`**
- Reusable small pill badge
- Props: `label: string`, optional `onRemove?: () => void`
- Style: `bg-gray-100 text-gray-600 rounded-full text-xs px-2 py-0.5`
- Renders a remove (×) button only when `onRemove` is provided

**`components/recipes/RecipeForm.tsx`**
- Shared form used by Add and Edit flows
- Props: `initialValues?: Partial<RecipeFormValues>`, `onSubmit: (values) => Promise<void>`, `isSubmitting: boolean`
- Fields: Title, Category (select), Tags (multi-select from user tag library), Ingredients (textarea), Steps (textarea), Notes (textarea), Source URL, Hero image (display + "Remove" button if `image_url` is present)
- Validates only `title` (required) and `category` (required) on submit
- All other fields optional — never block saving due to missing optional fields

**`components/recipes/AddRecipeModal.tsx`**
- Modal overlay triggered by the "Add Recipe" button on `/recipes`
- Two tabs: "From URL" and "Manual"
- Tab "From URL": URL text input + "Scrape" button; while pending show spinner + "Reading recipe…"; on success pre-fill `RecipeForm`; for each null field render placeholder text "Couldn't find this — add it manually" in the relevant input
- Tab "Manual": renders empty `RecipeForm` directly
- On successful save: close modal and refresh the recipe table

**`components/recipes/InlineTagEditor.tsx`**
- Used on the detail page only (not in full edit mode)
- Displays current tags as `TagPill` components with remove (×)
- Includes an "Add tag" selector showing tags from user's library not already applied
- Each add or remove fires `PATCH /api/recipes/[id]` immediately

**`components/recipes/LogMadeTodayButton.tsx`**
- Single button labelled "Log Made Today"
- On click: calls `POST /api/recipes/[id]/log`, disables button during request
- On success (`already_logged: false`): show checkmark + green tint for ~2 seconds, then reset
- On success (`already_logged: true`): show brief non-error message "Already logged today", then reset

**`components/recipes/DeleteConfirmDialog.tsx`**
- Modal dialog with message: "Are you sure? This can't be undone."
- Two buttons: "Cancel" (secondary) and "Delete" (destructive/red)
- On confirm: calls `DELETE /api/recipes/[id]`, then redirects to `/recipes`

**`components/recipes/ShareToggle.tsx`**
- Toggle switch labelled "Share with Forkcast community"
- Only rendered when `recipe.user_id === currentUser.id`
- On toggle: calls `PATCH /api/recipes/[id]/share` with the new boolean value

---

## 5. Business Logic

The Writer must enforce all of the following rules:

1. **Ownership checks** — `PATCH`, `DELETE`, and `PATCH /share` must verify `user_id = auth.uid()` server-side. Never rely solely on the client to enforce this.

2. **Tag validation** — On create and update, every tag in the `tags` array must exist in `user_tags` for the current user. Return `400` with a clear error message listing the unknown tags if validation fails.

3. **Tag display limit** — The table shows at most 3 tag pills per recipe. If a recipe has more, show a muted "+N more" label (e.g. "+2 more"). No tooltip needed.

4. **Scrape partial handling** — If `partial: true` in the scrape response, pre-fill whatever was found and render the placeholder string "Couldn't find this — add it manually" for each null field. Do not disable the Save button.

5. **Duplicate log prevention** — The `POST /api/recipes/[id]/log` route is idempotent. Handle the unique constraint gracefully (catch the error, return `already_logged: true`). The UI surfaces this as a soft message, not an error state.

6. **Read access for shared recipes** — `GET /api/recipes` and `GET /api/recipes/[id]` must return shared recipes to any authenticated user. Edit, delete, share toggle, and inline tag editor must only render in the UI when `recipe.user_id === currentUser.id`. Ownership is also enforced server-side on every mutating route.

7. **Category display labels** — Map enum values to readable labels everywhere in the UI:
   - `main_dish` → "Main Dish"
   - `breakfast` → "Breakfast"
   - `dessert` → "Dessert"
   - `side_dish` → "Side Dish"

8. **Mobile-first on detail page** — The detail page must be readable on mobile viewports (single-column layout, large touch targets for Log Made Today and Edit). The table view may horizontal-scroll on mobile.

9. **Never block saving** — The Save button must remain enabled for all optional fields. Only `title` and `category` are required; show inline validation errors for those two only.

10. **`GET /api/tags` scope** — Only return tags belonging to the current user (`auth.uid()`). Never return another user's tag library.

---

## 6. Test Cases

| # | Test case |
|---|---|
| T01 | User adds a recipe by URL; after scrape, form pre-fills with extracted title, ingredients, and steps |
| T02 | Scrape returns partial data (steps null); steps field shows placeholder; Save button remains enabled; save succeeds |
| T03 | User adds a recipe manually with no URL; all fields start empty; saves successfully |
| T04 | After saving, new recipe appears in the table with correct Name, Category, Tags, and Last Made = "Never" |
| T05 | Clicking recipe name in table navigates to `/recipes/[id]` |
| T06 | "Log Made Today" button calls the log API; Last Made date updates in the UI |
| T07 | Logging the same recipe twice on the same day returns `already_logged: true`; no duplicate row in `recipe_history` |
| T08 | Edit form pre-fills existing values; saving updates the detail page |
| T09 | Delete with confirmation dialog removes the recipe; user is redirected to `/recipes` |
| T10 | Share toggle sets `is_shared = true`; another authenticated user's `GET /api/recipes` includes the recipe |
| T11 | `PATCH /api/recipes/[id]` returns `403` when called by a non-owner |
| T12 | `DELETE /api/recipes/[id]` returns `403` when called by a non-owner |
| T13 | `GET /api/recipes/[id]` returns the recipe for a non-owner when `is_shared = true` |
| T14 | Table sort by Name, Category, and Last Made all produce correct ordering |
| T15 | Tag filter returns only recipes containing the selected tag |
| T16 | Category filter returns only recipes in the selected category |

---

## 7. Out of Scope

The following are explicitly NOT part of this sprint:

- Cook Mode
- Community/browse view for shared recipes (data model is built; UI is not)
- Full-text recipe search
- Grocery list generation
- Meal planning integration
- Importing from Notion or other external sources
- User-facing tag management UI (create/rename/delete tags)
- Pagination on the recipe table
- Image upload (only scraped image URLs are stored — no user file uploads)

---

*Awaiting owner approval before Writer proceeds.*
