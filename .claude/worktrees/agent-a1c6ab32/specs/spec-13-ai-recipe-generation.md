# Spec 13 — AI Recipe Generation

**Brief:** `briefs/brief-13-ai-recipe-generation.md`
**Branch:** `feature/ai-recipe-generation` from `staging`
**Status:** Awaiting owner approval before Writer proceeds.

---

## 1. Summary

This feature adds AI-powered recipe generation as a third entry point in the Add Recipe flow. The user describes what they want — optionally drawing from their pantry — and the LLM generates a complete recipe that pre-fills the standard `RecipeForm` for review before saving. Generated recipes are marked `source: 'generated'` and surfaced with an "AI generated" badge on the form and detail page. The pantry screen gains a shortcut to open the generate tab with the pantry toggle pre-enabled. The recipe detail page shows a "Regenerate" button for owner-authored generated recipes.

---

## 2. Pre-existing Artifacts to Verify

Spec-12 (Pantry) is fully implemented. However, **`PantryItem` and `PantryMatch` are missing from `types/index.ts`** — the pantry components and API routes import them from `@/types` but the interfaces were never added to the file. The Writer must add these types as part of this feature's types step (§3a below) to fix the build.

---

## 3. DB Changes

### Migration: `supabase/migrations/016_recipe_source.sql`

> The brief names this `015_recipe_source.sql` but `015` is already taken by the pantry migration. **Use `016_recipe_source.sql`.**

```sql
alter table recipes
  add column if not exists source text
    check (source in ('scraped', 'manual', 'generated'))
    default 'manual';
```

No other schema changes.

---

## 4. TypeScript Types (`types/index.ts`)

Apply all four changes in a single pass.

### 4a. Add missing pantry types (completing spec-12)

Append after `GroceryList`:

```typescript
export interface PantryItem {
  id:          string
  user_id:     string
  name:        string
  quantity:    string | null
  section:     string | null
  expiry_date: string | null  // "YYYY-MM-DD"
  added_at:    string
  updated_at:  string
}

export interface PantryMatch {
  recipe_id:     string
  recipe_title:  string
  match_count:   number
  matched_items: string[]
}
```

### 4b. Add `source` to `Recipe`

```typescript
source: 'scraped' | 'manual' | 'generated'
```

Add this field to the existing `Recipe` interface. It is non-nullable — after migration all existing rows default to `'manual'`.

### 4c. Add `GeneratedRecipe` type

Append after `PantryMatch`:

```typescript
export interface GeneratedRecipe {
  title:                 string
  ingredients:           string
  steps:                 string
  tags:                  string[]
  category:              'main_dish' | 'breakfast' | 'dessert' | 'side_dish'
  servings:              number | null
  prep_time_minutes:     number | null
  cook_time_minutes:     number | null
  total_time_minutes:    number | null
  inactive_time_minutes: number | null
  notes:                 string | null
}
```

### 4d. Add `MealTypeInput` alias

```typescript
export type MealTypeInput = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert'
```

---

## 5. API Routes

### 5a. `POST /api/recipes/generate`

**File:** `app/api/recipes/generate/route.ts`

**Auth:** Authenticated session required.

**Input:**
```typescript
{
  use_pantry:           boolean
  specific_ingredients: string        // comma or newline separated; may be empty string
  meal_type:            MealTypeInput
  style_hints:          string        // may be empty string
  dietary_restrictions: string[]      // tag names from DIETARY_TAGS
}
```

**Behavior:**

1. Validate auth. Return `401` if not authenticated.

2. If `use_pantry` is true: fetch the user's pantry items via a direct Supabase query (do not call the HTTP API internally):
   ```typescript
   const { data: pantryItems } = await supabase
     .from('pantry_items')
     .select('name, quantity')
     .eq('user_id', user.id)
     .order('name')
   ```

3. Build `combined_ingredient_list`:
   - If `use_pantry`: format each pantry item as `"${quantity ? quantity + ' ' : ''}${name}"`. E.g. `"2 cans diced tomatoes"`, `"chicken breast"`.
   - Parse `specific_ingredients` (split on commas and `\n`, trim each token, drop blanks).
   - Deduplicate by lowercased name across both lists (pantry names take precedence for display).
   - Format as a newline-separated bulleted list: `"- ${item}"`.

4. If both pantry items (after fetching) and parsed specific ingredients are empty strings / empty arrays: return `400 { error: 'No ingredients provided' }`.

5. Construct the prompt (see §LLM Prompt below).

6. Call the LLM via `anthropic.messages.create` (from `lib/llm.ts`):
   ```typescript
   const response = await anthropic.messages.create({
     model: process.env.LLM_MODEL ?? 'claude-sonnet-4-6',
     max_tokens: 2048,
     temperature: 0.8,   // creative generation — not extraction
     messages: [
       { role: 'user', content: userMessage },
     ],
     system: systemMessage,
   })
   ```

7. Parse the response:
   - Strip markdown code fences (same pattern as `scrape/route.ts`).
   - `JSON.parse` the cleaned text.
   - Validate and map each field (see §Parsing Rules).
   - On parse failure: log error, return `500 { error: 'Recipe generation failed — please try again' }`.

8. Return `200` with a `GeneratedRecipe` object.

**Parsing rules:**

| LLM field | Expected type | Validation | If missing/invalid |
|---|---|---|---|
| `title` | `string` | Non-empty string | Return `500` |
| `ingredients` | `string` | Non-empty string | `null` |
| `steps` | `string` | Non-empty string | `null` |
| `tags` | `string[]` | Filter to `FIRST_CLASS_TAGS` (case-insensitive, return canonical casing) | `[]` |
| `category` | `string` | Must be in `['main_dish','breakfast','dessert','side_dish']` | Use category-from-meal-type fallback (see §5b) |
| `servings` | `number` | Must be positive integer | `null` |
| `prepTimeMinutes` | `number` | Must be non-negative integer | `null` |
| `cookTimeMinutes` | `number` | Must be non-negative integer | `null` |
| `totalTimeMinutes` | `number` | Must be non-negative integer | `null` |
| `inactiveTimeMinutes` | `number` | Must be non-negative integer | `null` |
| `notes` | `string \| null` | String or null | `null` |

Map `prepTimeMinutes` → `prep_time_minutes`, etc. (camelCase from LLM → snake_case in response).

**Response shape (200):**
```typescript
{
  title:                 string
  ingredients:           string | null
  steps:                 string | null
  tags:                  string[]
  category:              'main_dish' | 'breakfast' | 'dessert' | 'side_dish'
  servings:              number | null
  prep_time_minutes:     number | null
  cook_time_minutes:     number | null
  total_time_minutes:    number | null
  inactive_time_minutes: number | null
  notes:                 string | null
}
```

**Error responses:**
- `400` — no ingredients
- `401` — not authenticated
- `500` — LLM failure (log the real error server-side, return generic message to client)

### 5b. Category-from-meal-type mapping

```typescript
function mealTypeToCategory(
  mealType: MealTypeInput,
): 'main_dish' | 'breakfast' | 'dessert' | 'side_dish' {
  switch (mealType) {
    case 'dinner':
    case 'lunch':    return 'main_dish'
    case 'breakfast': return 'breakfast'
    case 'snack':    return 'side_dish'
    case 'dessert':  return 'dessert'
  }
}
```

Use this as the fallback if the LLM returns an invalid/missing `category`. Also use it as the default `category` in the `RecipeForm` pre-fill even when the LLM does return a valid category (they should agree, but if not, the LLM's valid value wins).

### 5c. LLM Prompt

**System message:**

```
You are a creative recipe developer. Generate a complete, practical recipe based on the ingredients and preferences provided. The recipe should be realistic, delicious, and something a home cook can make.

Rules:
- Use the provided ingredients as the primary basis for the recipe
- You may add common pantry staples (salt, pepper, oil, garlic, onion) without them being listed — these are assumed available
- Respect all dietary restrictions strictly
- Match the requested meal type and any style hints
- Keep steps clear and practical for a home cook
- Suggest relevant tags only from this list: ${FIRST_CLASS_TAGS.join(', ')}

Return ONLY valid JSON with no prose or markdown:
{
  "title": "Recipe Name",
  "ingredients": "ingredient 1\ningredient 2\n...",
  "steps": "step 1\nstep 2\n...",
  "tags": ["Tag1", "Tag2"],
  "category": "main_dish|breakfast|dessert|side_dish",
  "servings": 4,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "totalTimeMinutes": 45,
  "inactiveTimeMinutes": null,
  "notes": "Optional note about the recipe"
}
```

**User message** (template — construct in the route handler):

```
Generate a ${meal_type} recipe.

Ingredients to use:
${combinedIngredientList}

Style / cuisine hints: ${style_hints || 'none'}

Dietary restrictions: ${dietary_restrictions.length > 0 ? dietary_restrictions.join(', ') : 'none'}

Make it practical and delicious.
```

### 5d. Modify `POST /api/recipes` (`app/api/recipes/route.ts`)

**Add `source` to the accepted body shape:**

```typescript
source?: 'scraped' | 'manual' | 'generated'
```

**Validation:** If `source` is present and not one of the three valid values, return `400`.

**Insert:** Include `source: body.source ?? 'manual'` in the Supabase insert payload.

No other changes to `POST /api/recipes`.

### 5e. Modify `PATCH /api/recipes/[id]` (`app/api/recipes/[id]/route.ts`)

**Strip `source` from PATCH payloads.** Do not add `source` to the accepted body type and do not include it in the `update` object. If a client sends `source`, silently ignore it. Do not return a validation error for it.

No other changes to `PATCH /api/recipes/[id]`.

### 5f. Scrape source assignment

The scrape route (`app/api/recipes/scrape/route.ts`) does not save recipes — it only returns extracted data. Source is assigned at save time in `AddRecipeModal.handleSubmit`. See §6c for the updated `handleSubmit` logic.

---

## 6. UI Components

### 6a. `components/recipes/GenerateRecipeTab.tsx`

**Purpose:** The "Generate with AI" tab content. Calls `POST /api/recipes/generate` and returns the result to the parent.

**Props:**
```typescript
interface GenerateRecipeTabProps {
  getToken:               () => Promise<string> | string
  onGenerated:            (recipe: GeneratedRecipe) => void
  initialPantryEnabled?:  boolean   // open with pantry toggle pre-on
  initialIngredients?:    string    // pre-fill specific ingredients (Regenerate flow)
}
```

**Local state:**
```typescript
pantryEnabled:        boolean        // default = initialPantryEnabled ?? false
pantryItems:          PantryItem[]   // fetched when pantryEnabled flips to true
pantryLoading:        boolean
pantryExpanded:       boolean        // "show/hide" the pantry preview list
specificIngredients:  string         // default = initialIngredients ?? ''
mealType:             MealTypeInput  // default = 'dinner'
styleHints:           string         // default = ''
dietaryRestrictions:  string[]       // default = pre-populated from avoided_tags (see §6a.1)
generating:           boolean
error:                string | null
```

**Mounted behavior (§6a.1 — dietary pre-population):**

On mount, fetch user preferences via the Supabase client and pre-check any tags in `DIETARY_TAGS` that appear in `avoided_tags`:

```typescript
useEffect(() => {
  async function prefillDietary() {
    const { data } = await supabase.from('user_preferences')
      .select('avoided_tags').eq('user_id', user.id).single()
    if (data?.avoided_tags) {
      const preChecked = data.avoided_tags.filter((t: string) =>
        (DIETARY_TAGS as readonly string[]).includes(t)
      )
      setDietaryRestrictions(preChecked)
    }
  }
  prefillDietary()
}, [])
```

Use `getSupabaseClient()` from `@/lib/supabase/browser` for this.

**Pantry fetch:** When `pantryEnabled` flips to `true` and `pantryItems` is empty, fetch `GET /api/pantry` and populate `pantryItems`. On flip to `false`, do not clear `pantryItems` (avoid re-fetching on re-toggle).

**Disabled condition for Generate button:**
```typescript
const canGenerate = pantryEnabled || specificIngredients.trim().length > 0
```

**On submit:**
1. Set `generating = true`, `error = null`.
2. Call `POST /api/recipes/generate` with the current form state.
3. On success: call `onGenerated(result)` — do NOT navigate or show form inside this component.
4. On error: set `error = 'Couldn\'t generate a recipe — try adjusting your ingredients'`. Keep inputs intact.
5. Set `generating = false`.

**Layout (top-to-bottom):**
1. Pantry toggle section — toggle label "Use my pantry ingredients"; when on, show `"Using ${pantryItems.length} pantry items"` + expand/collapse chevron; expanded: scrollable list of item names (max-h limited, overflow-y-auto).
2. "Ingredients to use" textarea — 500 char limit (show counter at limit), helper text.
3. Meal type pill selector — single-select pills: Breakfast, Lunch, Dinner, Snack, Dessert; default Dinner highlighted.
4. "Cuisine / style" text input — optional, max 100 chars, placeholder from brief.
5. "Dietary restrictions" multi-select pills — render `DIETARY_TAGS` as toggleable pills; pre-checked from `dietaryRestrictions` state.
6. Generate button — full width, primary style. Loading state: shows spinner + "Generating your recipe…".
7. Error message (if `error`) — inline below button, red text.

**Character limit display:** Show a small counter `"${specificIngredients.length}/500"` when the input has more than 400 characters. Enforce `maxLength={500}` on the textarea.

---

### 6b. `components/recipes/AIGeneratedBadge.tsx`

**Purpose:** Small, non-intrusive badge indicating AI origin.

**Props:** none (rendered conditionally by parent).

**Render:**
```tsx
<span className="inline-flex items-center gap-1 text-[11px] font-sans text-stone-400 bg-stone-100 rounded-full px-2.5 py-0.5">
  ✦ AI generated
</span>
```

The `✦` character (U+2736 SIX POINTED BLACK STAR) is used instead of an emoji — it renders consistently across platforms without color emoji presentation.

---

### 6c. Modify `AddRecipeModal.tsx`

**File:** `components/recipes/AddRecipeModal.tsx`

**Extend `Tab` type:**
```typescript
type Tab = 'url' | 'manual' | 'generate'
```

**Extend props:**
```typescript
interface AddRecipeModalProps {
  onClose:                   () => void
  onSaved:                   () => void
  getToken:                  () => Promise<string> | string
  initialTab?:               Tab        // default 'url'
  initialGenerateIngredients?: string   // passed to GenerateRecipeTab
  initialPantryEnabled?:     boolean    // passed to GenerateRecipeTab
}
```

**Initial tab state:**
```typescript
const [tab, setTab] = useState<Tab>(initialTab ?? 'url')
```

**Add generate state:**
```typescript
const [generatedRecipe, setGeneratedRecipe] = useState<GeneratedRecipe | null>(null)
```

**Tab labels:**
- `url` → `"From URL"`
- `manual` → `"Manual"`
- `generate` → `"Generate with AI"`

**Tab body rendering:**
```
tab === 'url' && !scrapeResult  → URL input + Scrape button (existing)
tab === 'url' && scrapeResult   → RecipeForm pre-filled with scrape result (existing)
tab === 'manual'                → RecipeForm with empty initial values (existing)
tab === 'generate' && !generatedRecipe → GenerateRecipeTab
tab === 'generate' && generatedRecipe  → RecipeForm pre-filled from generatedRecipe + AIGeneratedBadge
```

When `tab === 'generate' && generatedRecipe`:
- Show `<AIGeneratedBadge />` above the `RecipeForm`
- Show a "Regenerate" button (secondary/ghost style, small) below the badge — clicking it sets `generatedRecipe = null` to return to `GenerateRecipeTab` with inputs preserved (see §6c.1)
- Pass `initialValues` built from `generatedRecipe` (see §6c.2)

**Tab state preservation (§6c.1):**
- Switching tabs preserves `generatedRecipe`, `scrapeResult`, `urlInput` — none are cleared on tab switch.
- Only cleared on modal close (`onClose` call).
- `GenerateRecipeTab` is mounted with `initialPantryEnabled` and `initialGenerateIngredients` from modal props — these are one-time seeds, the tab maintains its own state after mount.

**Building `formInitialValues` from `generatedRecipe` (§6c.2):**
```typescript
const generateFormInitialValues: Partial<RecipeFormValues> = generatedRecipe
  ? {
      title: generatedRecipe.title,
      category: generatedRecipe.category,
      tags: generatedRecipe.tags,
      ingredients: generatedRecipe.ingredients ?? '',
      steps: generatedRecipe.steps ?? '',
      notes: generatedRecipe.notes ?? '',
      prep_time_minutes: generatedRecipe.prep_time_minutes !== null
        ? String(generatedRecipe.prep_time_minutes) : '',
      cook_time_minutes: generatedRecipe.cook_time_minutes !== null
        ? String(generatedRecipe.cook_time_minutes) : '',
      total_time_minutes: generatedRecipe.total_time_minutes !== null
        ? String(generatedRecipe.total_time_minutes) : '',
      inactive_time_minutes: generatedRecipe.inactive_time_minutes !== null
        ? String(generatedRecipe.inactive_time_minutes) : '',
      servings: generatedRecipe.servings !== null
        ? String(generatedRecipe.servings) : '',
    }
  : {}
```

**`handleSubmit` source assignment:**

Update `handleSubmit` to accept the current tab context and set `source` accordingly:

```typescript
// Determine source based on which tab produced the form
const source: 'scraped' | 'manual' | 'generated' =
  tab === 'generate' ? 'generated'
  : tab === 'url'    ? 'scraped'
  : 'manual'
```

Include `source` in the `POST /api/recipes` body.

---

### 6d. Modify `app/(app)/recipes/[id]/page.tsx`

**Add modal state:**
```typescript
const [showRegenerate, setShowRegenerate] = useState(false)
```

**Import `AddRecipeModal`:**
```typescript
import AddRecipeModal from '@/components/recipes/AddRecipeModal'
```

**Add `AIGeneratedBadge` in the header section** (between category label and title) when `recipe.source === 'generated'`:
```tsx
{recipe.source === 'generated' && (
  <div className="mb-2">
    <AIGeneratedBadge />
  </div>
)}
```

**Add Regenerate button in the footer** (after the Edit button, before Log/Delete), only when `isOwner && recipe.source === 'generated'`:
```tsx
{isOwner && recipe.source === 'generated' && (
  <button
    onClick={() => setShowRegenerate(true)}
    className="font-display font-medium text-[13px] text-stone-700 border border-stone-200 rounded-xl py-2 px-4 bg-white hover:bg-stone-50"
  >
    Regenerate
  </button>
)}
```

**Render `AddRecipeModal` conditionally:**
```tsx
{showRegenerate && (
  <AddRecipeModal
    onClose={() => setShowRegenerate(false)}
    onSaved={() => setShowRegenerate(false)}
    getToken={getAccessToken}
    initialTab="generate"
    initialGenerateIngredients={recipe.ingredients ?? ''}
  />
)}
```

On `onSaved`: the modal closes. The user remains on the current recipe's detail page. The new generated recipe is in the vault. No navigation — the user can find it in `/recipes`.

---

### 6e. Modify `components/pantry/PantryPageClient.tsx`

**Add modal state:**
```typescript
const [showGenerateModal, setShowGenerateModal] = useState(false)
```

**Import `AddRecipeModal`:**
```typescript
import AddRecipeModal from '@/components/recipes/AddRecipeModal'
```

**Add "Generate a new recipe from my pantry" button** in the toolbar area near the existing "What can I make?" button. Use a secondary/outline style to distinguish it from the primary "What can I make?" button:
```tsx
<button
  onClick={() => setShowGenerateModal(true)}
  className="text-sm font-medium text-stone-600 border border-stone-200 rounded-lg px-3 py-1.5 hover:bg-stone-50"
>
  Generate new recipe
</button>
```

**Render modal conditionally:**
```tsx
{showGenerateModal && (
  <AddRecipeModal
    onClose={() => setShowGenerateModal(false)}
    onSaved={() => {
      setShowGenerateModal(false)
      // Navigate to recipes vault after saving
      window.location.href = '/recipes'
    }}
    getToken={getAccessToken}
    initialTab="generate"
    initialPantryEnabled={true}
  />
)}
```

---

## 7. Business Logic Rules

The Writer must enforce the following:

1. **LLM tag validation is server-side, not client-side.** The route filters the returned `tags` array against `FIRST_CLASS_TAGS` using case-insensitive comparison and returns canonical casing from the list. The client never needs to re-filter.

2. **Pantry context is best-effort.** If `use_pantry` is true but the pantry is empty (0 items), proceed with `specific_ingredients` alone. The emptiness check applies to the combined list — only return `400` when both sources are empty.

3. **Regenerate never auto-saves.** Clicking "Regenerate" from the detail page opens the modal. The user must click "Save Recipe" to create a new recipe. The existing recipe with `source: 'generated'` is never modified by this flow.

4. **`source` is immutable after creation.** The `PATCH /api/recipes/[id]` route must silently strip `source` from any incoming body — it is not added to the accepted body type and not included in the `update` payload. Do not error on its presence.

5. **Category-from-meal-type mapping is a fallback only.** The route uses the LLM-returned `category` if it's a valid value. The mapping function is only applied when the LLM returns an invalid or missing `category`.

6. **Dietary pre-population is advisory.** Dietary restrictions fetched from user preferences are pre-checked but fully editable. The user may uncheck any or all of them before generating.

7. **Tab state clears only on modal close.** Switching between URL, Manual, and Generate tabs does not reset state on any tab. `generatedRecipe`, `scrapeResult`, `urlInput`, and `GenerateRecipeTab`'s internal state all persist across tab switches within a single modal open/close cycle.

8. **Pantry items fetched on-demand.** `GenerateRecipeTab` fetches pantry items only when `pantryEnabled` first flips to `true`, not on mount. Subsequent tab-back-to-Generate does not re-fetch if items are already loaded.

9. **No streaming in this sprint.** The `POST /api/recipes/generate` route returns a single JSON response (non-streaming). The UI shows a full loading spinner while the request is in flight. Streaming via SSE is explicitly deferred.

10. **`source` defaults to `'manual'`** in `POST /api/recipes` when not supplied. The migration sets the default on the DB column, and the API handler mirrors this with `body.source ?? 'manual'`.

---

## 8. Test Cases

| # | Test case | File hint |
|---|---|---|
| T01 | Generate tab renders in `AddRecipeModal` when `initialTab="generate"` | `components/recipes/__tests__/AddRecipeModal.test.tsx` |
| T02 | Generate button disabled when pantry off and ingredients empty | `components/recipes/__tests__/GenerateRecipeTab.test.tsx` |
| T03 | Generate button enabled when `pantryEnabled=true` (even if pantry fetch returns 0 items) | same |
| T04 | Generate button enabled when `specificIngredients` is non-empty | same |
| T05 | `POST /api/recipes/generate` returns `400` when pantry has 0 items and `specific_ingredients` is blank | `app/api/recipes/generate/__tests__/generate.test.ts` |
| T06 | `POST /api/recipes/generate` returns a valid `GeneratedRecipe` on success | same |
| T07 | Tags returned by LLM are filtered to `FIRST_CLASS_TAGS` — unrecognised tags are dropped | same |
| T08 | Invalid LLM `category` falls back to `mealTypeToCategory('dinner') === 'main_dish'` | same |
| T09 | All `mealType` → `category` mappings are correct | same |
| T10 | `POST /api/recipes/generate` returns `500` when LLM call throws | same |
| T11 | `POST /api/recipes/generate` returns `500` when LLM returns unparseable JSON | same |
| T12 | Generated recipe pre-fills `RecipeForm` with all returned fields | `components/recipes/__tests__/AddRecipeModal.test.tsx` |
| T13 | `AIGeneratedBadge` appears above `RecipeForm` in generate tab after generation | same |
| T14 | `AIGeneratedBadge` appears on recipe detail page when `recipe.source === 'generated'` | `app/(app)/recipes/__tests__/RecipeDetail.test.tsx` |
| T15 | `AIGeneratedBadge` does NOT appear when `recipe.source === 'manual'` | same |
| T16 | "Regenerate" button appears on detail page only when `isOwner && source === 'generated'` | same |
| T17 | "Regenerate" opens modal at generate tab with recipe ingredients pre-filled | same |
| T18 | Saving a generated recipe calls `POST /api/recipes` with `source: 'generated'` | `components/recipes/__tests__/AddRecipeModal.test.tsx` |
| T19 | Saving from URL tab calls `POST /api/recipes` with `source: 'scraped'` | same |
| T20 | Saving from Manual tab calls `POST /api/recipes` with `source: 'manual'` | same |
| T21 | `POST /api/recipes` accepts and saves `source` field | `app/api/recipes/__tests__/recipes.test.ts` |
| T22 | `POST /api/recipes` defaults `source` to `'manual'` when not supplied | same |
| T23 | `PATCH /api/recipes/[id]` ignores `source` in request body — does not update it | same |
| T24 | `016_recipe_source.sql` migration adds `source` column with check constraint and default | `supabase/migrations/__tests__/` (or manual note) |
| T25 | Dietary restrictions from `avoided_tags` ∩ `DIETARY_TAGS` are pre-checked | `components/recipes/__tests__/GenerateRecipeTab.test.tsx` |
| T26 | Tab switching preserves generate tab state (generatedRecipe survives URL tab visit) | `components/recipes/__tests__/AddRecipeModal.test.tsx` |
| T27 | Modal close clears all tab state | same |
| T28 | Pantry page "Generate new recipe" button opens modal at generate tab with pantry toggle pre-on | `components/pantry/__tests__/PantryPageClient.test.tsx` |
| T29 | `PantryItem` and `PantryMatch` types now exported from `@/types` (compile check) | inferred from build passing |
| T30 | Pantry items are fetched only on first toggle-on, not on mount | `components/recipes/__tests__/GenerateRecipeTab.test.tsx` |

---

## 9. Out of Scope

- Streaming SSE response from `POST /api/recipes/generate` (deferred)
- Generating recipe variations of an existing recipe ("make this vegetarian")
- Batch generation (multiple recipes at once)
- Community sharing of AI-generated recipes
- Rating or feedback on generated recipes
- Fine-tuning or training on user preferences over time
- Image generation for recipe hero photos
- Voice input for ingredients
- Overwriting an existing recipe via the Regenerate flow (always saves as new)
- Any change to `source` via `PATCH /api/recipes/[id]` (fully stripped)

---

Awaiting owner approval before Writer proceeds.
