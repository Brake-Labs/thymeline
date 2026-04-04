# Brief 13 — AI Recipe Generation

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/ai-recipe-generation`
**Target:** PR into `staging`
**Depends on:** Briefs 01–07, Brief 12 (Pantry) merged to staging

---

## User Story

As a Forkcast user, I want to generate new recipes using AI — either from
ingredients I have in my pantry, specific ingredients I want to use up, or
a combination of both — so I can reduce food waste and discover meals tailored
exactly to what I have on hand.

---

## Core Concept

AI recipe generation is a new entry point in the Add Recipe flow. Instead of
scraping a URL or entering a recipe manually, the user describes what they want
and the LLM generates a complete recipe. The generated recipe is pre-filled into
the standard recipe form, where the user can edit before saving to their vault.

Generated recipes are saved to the vault like any other recipe — they go through
the same form, same validation, and same data model. The only difference is their
origin is marked as `'generated'` rather than `'scraped'` or `'manual'`.

---

## Screens & Features

### 1. New Tab in Add Recipe Modal — "Generate with AI"

Add a third tab to the existing `AddRecipeModal`:
- Tab A: From URL (existing)
- Tab B: Manual (existing)
- Tab C: Generate with AI (new)

**Generate with AI tab layout:**

**Pantry toggle:**
- "Use my pantry ingredients" toggle (on/off, default off)
- When on: fetches the user's current pantry and includes all items in the
  generation prompt. Shows a preview: "Using 12 pantry items" with a small
  expandable list of what's included.

**Specific ingredients input:**
- Label: "Ingredients to use"
- Free text input: user types ingredients separated by commas or line breaks
  (e.g. "chicken thighs, leftover rice, spinach")
- Character limit: 500
- Helper text: "Tell us what you'd like to use up — we'll build a recipe around it"

**Meal type selector:**
- Pill toggles: Breakfast, Lunch, Dinner, Snack, Dessert
- Single select, default: Dinner

**Cuisine / style hints (optional):**
- Free text input, max 100 chars
- Placeholder: "e.g. Italian, quick weeknight, comfort food, spicy"

**Dietary restrictions (optional):**
- Multi-select pills from the Dietary tag group (Vegetarian, Vegan, Gluten-Free, etc.)
- Pre-populated from the user's `avoided_tags` preference (tags in the Dietary
  group that are in the user's avoided list are pre-checked)

**"Generate Recipe" button:**
- Primary, full width on mobile
- Disabled if both pantry toggle is off AND specific ingredients is empty
- Loading state: "Generating your recipe…" + spinner
- Streaming preferred: show recipe fields filling in progressively as the LLM
  responds (title first, then ingredients, then steps)

**On success:**
- Pre-fill the standard `RecipeForm` with the generated recipe
- User can edit any field before saving
- "Regenerate" button available to discard and regenerate with the same inputs
- Show a subtle "AI generated" badge on the form

**On failure:**
- Inline error: "Couldn't generate a recipe — try adjusting your ingredients"
- Keep inputs intact so user can retry

---

### 2. Pantry "What can I make?" — Generate Variant

On the pantry screen, alongside the existing "What can I make?" button (which
finds matching vault recipes), add a second option:

- "Generate a new recipe from my pantry" button
- Opens the Generate with AI tab in `AddRecipeModal` with pantry toggle
  pre-enabled and focused on the specific ingredients input

---

### 3. Recipe Detail — "Regenerate" (owner only)

On any AI-generated recipe's detail page (where `source = 'generated'`), show
a "Regenerate" button in the footer alongside Edit/Delete.

- Opens the Generate with AI tab pre-filled with the recipe's ingredients
- User can adjust and regenerate, then save as a new recipe or overwrite the existing one

---

## API Routes

### `POST /api/recipes/generate`

**Purpose:** Generate a complete recipe using the LLM.

**Auth:** Authenticated session required.

**Input:**
```typescript
{
  use_pantry:           boolean
  specific_ingredients: string        // comma or newline separated, may be empty
  meal_type:            'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert'
  style_hints:          string        // may be empty
  dietary_restrictions: string[]      // tag names from Dietary group
}
```

**Behavior:**
1. If `use_pantry` is true: fetch user's pantry items from `GET /api/pantry`
2. Combine pantry items + `specific_ingredients` into an ingredient context block
3. If both are empty: return `400`
4. Construct the generation prompt (see §LLM Prompt)
5. Call the LLM via `lib/llm.ts` using `claude-sonnet-4-6`
6. Parse the structured response
7. Return the generated recipe fields

**Response:**
```typescript
{
  title:       string
  ingredients: string    // newline-separated
  steps:       string    // newline-separated, plain text
  tags:        string[]  // suggested tags from FIRST_CLASS_TAGS only
  category:    'main_dish' | 'breakfast' | 'dessert' | 'side_dish'
  servings:    number | null
  prep_time_minutes:     number | null
  cook_time_minutes:     number | null
  total_time_minutes:    number | null
  inactive_time_minutes: number | null
  notes:       string | null   // e.g. "Great for using up leftover rice"
}
```

**Errors:**
- `400` — no ingredients provided (pantry empty + specific_ingredients empty)
- `500` — LLM call fails (log and surface generic message)

Always returns 200 on partial generation — if some fields are null, pre-fill
what's available and let the user complete the rest.

---

## LLM Prompt

### System message

```
You are a creative recipe developer. Generate a complete, practical recipe
based on the ingredients and preferences provided. The recipe should be
realistic, delicious, and something a home cook can make.

Rules:
- Use the provided ingredients as the primary basis for the recipe
- You may add common pantry staples (salt, pepper, oil, garlic, onion) without
  them being listed — these are assumed available
- Respect all dietary restrictions strictly
- Match the requested meal type and any style hints
- Keep steps clear and practical for a home cook
- Suggest relevant tags only from this list: {FIRST_CLASS_TAGS}

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

### User message

```
Generate a {meal_type} recipe.

Ingredients to use:
{combined_ingredient_list}

Style / cuisine hints: {style_hints or "none"}

Dietary restrictions: {dietary_restrictions or "none"}

Make it practical and delicious.
```

**Constructing `combined_ingredient_list`:**
- If `use_pantry`: list all pantry item names + quantities (e.g. "2 cans diced tomatoes")
- Append any `specific_ingredients` the user typed
- Deduplicate
- Format as a bulleted list

---

## DB Changes

### Add `source` column to `recipes`

```sql
alter table recipes
  add column if not exists source text
    check (source in ('scraped', 'manual', 'generated'))
    default 'manual';
```

Migration: `015_recipe_source.sql`

Update `POST /api/recipes` to accept and save `source`.

Update `types/index.ts`:
```typescript
source: 'scraped' | 'manual' | 'generated'
```

The scrape route should set `source: 'scraped'` when saving. Manual entry sets
`source: 'manual'`. Generation sets `source: 'generated'`.

---

## UI Components

**`components/recipes/GenerateRecipeTab.tsx`**
- The Generate with AI tab content
- Props: `onGenerated: (recipe: GeneratedRecipe) => void`
- Manages pantry toggle, ingredient input, meal type, style hints, dietary restrictions
- Calls `POST /api/recipes/generate` on submit
- On success: calls `onGenerated` to pre-fill `RecipeForm`

**`components/recipes/AIGeneratedBadge.tsx`**
- Small badge shown on the recipe form and detail page when `source === 'generated'`
- Style: subtle, muted — "AI generated" in small text with a sparkle indicator
- Not intrusive — this is supplementary info, not a prominent label

**Updates to `AddRecipeModal.tsx`:**
- Add third tab "Generate with AI"
- Tab switching preserves state (same as URL↔Manual tab persistence)
- Pass `source` to the save handler

**Updates to `app/(app)/recipes/[id]/page.tsx`:**
- Show "Regenerate" button in footer when `recipe.source === 'generated'` and user is owner

---

## Business Logic

1. **Pantry context is best-effort** — if the pantry is empty and `use_pantry`
   is true, proceed with just `specific_ingredients`. If both are empty, return 400.

2. **Generated tags are validated** — the LLM is instructed to only return tags
   from `FIRST_CLASS_TAGS`. Server-side: filter the returned tags array against
   `FIRST_CLASS_TAGS` before returning. Drop any tags not in the list.

3. **Category mapping from meal type:**
   - `dinner` → `main_dish`
   - `lunch` → `main_dish`
   - `breakfast` → `breakfast`
   - `snack` → `side_dish`
   - `dessert` → `dessert`

4. **Regenerate does not auto-save** — clicking "Regenerate" on the detail page
   opens the modal pre-filled. The user must explicitly save to overwrite or save
   as new. Never auto-overwrite an existing recipe.

5. **Dietary restrictions pre-population** — on mount, fetch user preferences
   and pre-check any tags from the Dietary group that are in `avoided_tags`.
   User can uncheck them for this generation.

6. **Tab state persistence** — switching between tabs in `AddRecipeModal`
   preserves the Generate tab's input state. State clears only on modal close.

7. **Streaming** — if the LLM supports streaming, stream the response and
   progressively fill in form fields as they arrive. Title renders first, then
   ingredients, then steps. If streaming is unavailable, show a full-page loading
   state until the response arrives.

8. **`source` field is not editable** — `PATCH /api/recipes/[id]` accepts
   `source` updates only from `'generated'` to `'manual'` (if a user heavily
   edits a generated recipe they may want to reclassify it — future consideration).
   For now, strip `source` from PATCH payloads and never allow it to change.

---

## Test Cases

| # | Test case |
|---|---|
| T01 | Generate tab renders in AddRecipeModal |
| T02 | Generate button disabled when pantry off and ingredients empty |
| T03 | Generate button enabled when pantry on (even if ingredients empty) |
| T04 | Generate button enabled when ingredients provided (even if pantry off) |
| T05 | POST /api/recipes/generate returns 400 when pantry empty + no ingredients |
| T06 | Generated recipe pre-fills RecipeForm with all returned fields |
| T07 | Suggested tags are filtered to FIRST_CLASS_TAGS only |
| T08 | Dietary restrictions from user avoided_tags are pre-checked |
| T09 | "AI generated" badge appears on form and detail page for generated recipes |
| T10 | "Regenerate" button appears on detail page when source === 'generated' |
| T11 | "Regenerate" opens modal pre-filled with recipe ingredients |
| T12 | Saving a generated recipe sets source = 'generated' |
| T13 | source column is added to recipes table (migration) |
| T14 | Pantry toggle fetches pantry items and includes them in prompt |
| T15 | Tab switching preserves Generate tab input state |
| T16 | Modal close clears Generate tab state |
| T17 | Category maps correctly from meal_type (dinner → main_dish) |
| T18 | POST /api/recipes/generate returns 500 on LLM failure with generic message |

---

## Out of Scope

- Generating recipe variations (e.g. "make this recipe vegetarian")
- Batch generation (multiple recipes at once)
- Community sharing of AI-generated recipes
- Rating or feedback on generated recipes
- Fine-tuning or training on user preferences over time
- Image generation for recipe hero photos
- Voice input for ingredients
