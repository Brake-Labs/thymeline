# Brief 21 — Waste-Aware Planning

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/waste-aware-planning`
**Target:** PR into `main`
**Depends on:** Briefs 01–07, Brief 20 (Taste Profile) merged to main

---

## User Story

As a Thymeline user, I want Help Me Plan to suggest recipes that make smart use
of ingredients I'll already be buying — so if one recipe uses half a bag of
coleslaw mix, another recipe that week uses the rest, reducing waste and saving
me money.

---

## Core Concept

When generating a week's meal suggestions, the planner reasons about ingredient
overlap across the full two-week planning window. Recipes that share ingredients
with other planned or suggested meals are preferred. When a suggestion is
influenced by waste-awareness, a small badge appears explaining why — "Uses up
your coleslaw mix" — so the connection feels helpful rather than mysterious.

Waste-awareness applies to any ingredient that could go to waste if unused:
perishable produce, opened dairy, partial cans, fresh herbs, etc. Pantry staples
(salt, oil, spices) are excluded.

The LLM does the ingredient overlap reasoning — no structured ingredient parsing
required. The planner sends both recipes' ingredient text and asks the model to
identify shared waste-risk ingredients.

---

## How It Works

### Planning window

The waste-awareness window spans **two weeks**:
- The current week being planned
- Any saved plan for the following week (if one exists)

If the user is planning Week A and Week B already has a saved plan, Week B's
recipes are included in the overlap analysis. If Week B has no plan, only
Week A is considered.

### Overlap detection

After the LLM generates initial suggestions for the week, a second LLM pass
analyzes ingredient overlap:

1. Collect all recipe ingredients for the suggested week (and the next week's
   saved plan if it exists)
2. Send to LLM with a prompt: "Identify shared ingredients across these recipes
   that could go to waste if unused — things like produce, dairy, opened cans,
   fresh herbs. Exclude pantry staples (salt, oil, spices, dried herbs)."
3. LLM returns a list of overlap pairs:
   ```json
   [
     {
       "ingredient": "coleslaw mix",
       "recipe_ids": ["abc123", "def456"],
       "waste_risk": "high"
     }
   ]
   ```
4. Use these pairs to re-rank suggestions: recipes that share waste-risk
   ingredients with other planned recipes are boosted.

### Re-ranking

After overlap detection, re-score the suggestions:
- Each recipe gets a `waste_score` = number of waste-risk ingredients it shares
  with other recipes in the window
- Recipes with higher `waste_score` are surfaced more prominently in the options
  shown to the user
- This is a soft boost — variety and taste profile still matter. A recipe with
  a waste_score of 3 is not forced in if it conflicts with dietary preferences
  or cooldown.

### Waste badge

When a suggestion has `waste_score > 0`, show a small badge on the suggestion
card in the Help Me Plan suggestions screen:

- Style: amber pill badge (matches the "Modified for tonight" badge pattern)
- Text: "Uses up your [ingredient]" — e.g. "Uses up your coleslaw mix",
  "Uses up your spinach", "Uses up your heavy cream"
- If multiple shared ingredients: show the most perishable one (the LLM's
  `waste_risk: "high"` items take priority), or "Uses up 2 ingredients"
- Badge appears on the `SuggestionMealSlotRow` card alongside the recipe title

---

## API Changes

### `POST /api/plan/suggest`

**New input field:**
```typescript
{
  // existing fields...
  include_next_week_plan?: boolean  // default true
}
```

**New behavior (after existing suggestion generation):**

1. If `include_next_week_plan` is true, fetch the saved plan for
   `week_start + 7 days` (if it exists)

2. Run overlap detection pass (second LLM call):

**Overlap detection prompt:**

```
You are analyzing a set of recipes to identify ingredient overlap that could
help reduce food waste.

RECIPES THIS WEEK:
{recipe_id}: {title}
Ingredients: {ingredients}
...

RECIPES NEXT WEEK (already planned):
{recipe_id}: {title}
Ingredients: {ingredients}
...

Identify shared ingredients across these recipes that have waste risk — things
that come in quantities larger than one recipe needs: produce, dairy, opened
cans, fresh herbs, specialty ingredients. Exclude pantry staples (salt, pepper,
oil, sugar, flour, dried spices).

Return ONLY valid JSON, no markdown:
[
  {
    "ingredient": "ingredient name",
    "recipe_ids": ["id1", "id2"],
    "waste_risk": "high" | "medium"
  }
]

Return [] if no meaningful overlap exists.
```

3. Attach `waste_matches` to each suggestion in the response

**Updated response shape:**
```typescript
{
  days: {
    date: string
    meal_types: {
      meal_type: string
      options: {
        recipe_id:      string
        recipe_title:   string
        reason?:        string
        waste_matches?: {          // new
          ingredient:  string
          waste_risk:  'high' | 'medium'
          shared_with: string[]    // recipe_ids of other recipes sharing this ingredient
        }[]
      }[]
    }[]
  }[]
}
```

---

## UI Changes

### `components/plan/SuggestionMealSlotRow.tsx`

When a suggestion has `waste_matches` with at least one entry:

- Show an amber pill badge below the recipe title
- Badge text logic:
  - 1 high-risk match: "Uses up your {ingredient}"
  - 1 medium-risk match: "Uses up your {ingredient}"
  - 2+ matches: "Uses up {N} ingredients"
  - If the shared recipe is from next week's plan: "Pairs with next week's plan"
- Badge is informational only — no interaction needed
- Style: `background: #FFF0C0`, `color: #5C4A00`, same as cuisine tag pills
  but with a leaf/recycle icon (use `Leaf` from lucide-react, 12px)

### `components/plan/SuggestionsStep.tsx`

No structural changes — the badge renders within `SuggestionMealSlotRow`.

---

## `lib/waste-overlap.ts` — new file

Pure functions for waste overlap logic, keeping route code clean:

```typescript
export interface WasteMatch {
  ingredient:  string
  waste_risk:  'high' | 'medium'
  shared_with: string[]
}

export interface RecipeForOverlap {
  recipe_id:   string
  title:       string
  ingredients: string
}

export async function detectWasteOverlap(
  thisWeekRecipes: RecipeForOverlap[],
  nextWeekRecipes: RecipeForOverlap[],
  llm: typeof callLLM
): Promise<Map<string, WasteMatch[]>>
// Returns a Map of recipe_id -> WasteMatch[]

export function getPrimaryWasteBadgeText(matches: WasteMatch[]): string
// Returns the badge text string for display
```

---

## Business Logic

1. **Overlap detection is a second LLM call** — it runs after the initial
   suggestion generation, only if there are suggestions to analyze. If the
   first pass fails, skip overlap detection gracefully (no badge, no error).

2. **Waste-awareness is a soft signal** — it boosts but never forces. A recipe
   with high waste overlap is shown more prominently in the options list, but
   the user still sees all options and can pick freely.

3. **Two-week window** — current week suggestions + next week's saved plan
   (if any). Does not look further ahead. Does not consider pantry contents
   (that's a future integration with Brief 12).

4. **Pantry exclusion** — pantry staples are excluded via LLM instruction.
   The LLM is trusted to make reasonable judgments about what constitutes a
   staple vs. a waste-risk ingredient.

5. **Badge shows most actionable ingredient** — if multiple matches exist,
   show the highest `waste_risk` one. If tied, show the most specific/unusual
   ingredient (e.g. "tamarind paste" over "milk").

6. **Next week plan is read-only** — the overlap detection uses next week's
   existing plan as context but never modifies it. The user's next week plan
   is not changed by this feature.

7. **Performance** — the second LLM call adds latency. Run it in parallel with
   any other post-processing. If it takes longer than 8 seconds, time out and
   return suggestions without waste badges (fail gracefully).

8. **Household scope** — uses the household's combined plan if the user is in
   a household. Both weeks are scoped to the household's plan.

9. **Empty next week** — if no saved plan exists for next week, overlap
   detection only considers the current week's suggestions against each other.
   This still catches intra-week overlap (e.g. two recipes both using spinach).

10. **JSON fence stripping** — the overlap detection LLM response must be
    parsed with fence stripping (same pattern as other LLM calls in the
    codebase: strip ` ```json ` fences before `JSON.parse()`).

---

## Test Cases

| # | Test case |
|---|---|
| T01 | Overlap detection runs after suggestion generation |
| T02 | detectWasteOverlap returns correct matches for shared ingredient |
| T03 | Pantry staples (salt, oil) are not returned as waste matches |
| T04 | Produce and dairy are returned as waste matches |
| T05 | waste_matches attached to correct recipe_id in response |
| T06 | Suggestion with waste_match shows amber badge |
| T07 | Badge text: single high-risk match shows "Uses up your {ingredient}" |
| T08 | Badge text: 2+ matches shows "Uses up 2 ingredients" |
| T09 | No badge shown when waste_matches is empty |
| T10 | Next week's saved plan is fetched and included in overlap analysis |
| T11 | No next week plan — overlap detection uses only current week |
| T12 | Overlap detection timeout (>8s) returns suggestions without badges |
| T13 | Overlap detection LLM failure returns suggestions without badges |
| T14 | Re-ranking boosts recipes with higher waste_score |
| T15 | Waste-aware boost does not override cooldown or dietary exclusions |
| T16 | Household: both weeks scoped to household plan |
| T17 | getPrimaryWasteBadgeText returns highest waste_risk ingredient |
| T18 | JSON fence stripping applied to overlap detection LLM response |

---

## Out of Scope

- Pantry integration (using pantry contents to inform waste detection — future)
- Waste awareness in Recipe Generation (Brief 22)
- Waste awareness in Recipe Discovery (Brief 22)
- Grocery list deduplication based on overlap (future)
- Showing waste savings in dollars or weight
- User-configurable waste sensitivity settings
- Looking more than 2 weeks ahead
