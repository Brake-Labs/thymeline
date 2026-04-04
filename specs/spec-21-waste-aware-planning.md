# Spec 21 — Waste-Aware Planning

**Brief:** `briefs/brief-21-waste-aware-planning.md`
**Branch:** `feature/waste-aware-planning` (cut from `staging`)
**Depends on:** Brief 20 (Taste Profile) merged
**Status:** Approved — Writer may proceed

---

## 1. Summary

After Help Me Plan generates its initial suggestions, a second LLM pass identifies ingredient overlap across the two-week planning window. Suggestions that share waste-risk ingredients with other planned meals are boosted in the options list and get a small amber badge — "Uses up your coleslaw mix" — so the connection is visible to the user.

No new DB schema. Five files change.

---

## 2. No migrations needed

This feature is entirely API and UI logic. No new columns or tables.

---

## 3. Files changed — complete list

| File | Change |
|---|---|
| `lib/waste-overlap.ts` | New server-only module |
| `types/index.ts` | Add `WasteMatch` interface; update `RecipeSuggestion` |
| `lib/schemas.ts` | Add `include_next_week_plan` to `suggestSchema` |
| `app/api/plan/suggest/route.ts` | Fetch next week, run overlap detection, re-rank, attach badge text |
| `components/plan/SuggestionMealSlotRow.tsx` | Render waste badge per suggestion option |

---

## 4. Types (`types/index.ts`)

**Add `WasteMatch`** (new interface, near the plan types around line 105):

```typescript
export interface WasteMatch {
  ingredient:    string
  waste_risk:    'high' | 'medium'
  shared_with:   string[]       // recipe_ids of other recipes sharing this ingredient
  has_next_week: boolean        // true if any shared recipe is from next week's plan
}
```

**Update `RecipeSuggestion`** (lines 105–109) to add two optional fields:

```typescript
export interface RecipeSuggestion {
  recipe_id:        string
  recipe_title:     string
  reason?:          string
  waste_matches?:   WasteMatch[]   // new — full overlap data
  waste_badge_text?: string         // new — pre-computed display string
}
```

`waste_badge_text` is computed server-side (see §7) so the component only needs to render a string — no logic in the component about next-week context.

---

## 5. Schema (`lib/schemas.ts`)

Update `suggestSchema` (line 137) to add the new optional field:

```typescript
export const suggestSchema = z.object({
  week_start:             dateString,
  active_dates:           z.array(dateString).min(1),
  active_meal_types:      z.array(mealType).default(['dinner']),
  prefer_this_week:       z.array(z.string()).default([]),
  avoid_this_week:        z.array(z.string()).default([]),
  free_text:              z.string().default(''),
  include_next_week_plan: z.boolean().default(true),   // new
})
```

---

## 6. `lib/waste-overlap.ts` — new server-only module

This module makes LLM calls and must not be imported by client components. Do not add `'use client'`. Add a comment at the top: `// server-only — do not import from client components`.

```typescript
import { parseLLMJsonSafe, LLM_MODEL_FAST } from '@/lib/llm'
import type { callLLM } from '@/lib/llm'
import type { WasteMatch } from '@/types'

export interface RecipeForOverlap {
  recipe_id:   string
  title:       string
  ingredients: string
}

const OVERLAP_DETECTION_TIMEOUT_MS = 8000
```

### `detectWasteOverlap`

```typescript
export async function detectWasteOverlap(
  thisWeekRecipes: RecipeForOverlap[],
  nextWeekRecipes: RecipeForOverlap[],
  llm: typeof callLLM,
): Promise<Map<string, WasteMatch[]>>
```

All recipes combined must be non-empty; return an empty map otherwise.

**Build the prompt:**

```typescript
function buildOverlapPrompt(
  thisWeek: RecipeForOverlap[],
  nextWeek: RecipeForOverlap[],
): string {
  const formatRecipe = (r: RecipeForOverlap) =>
    `${r.recipe_id}: ${r.title}\nIngredients: ${r.ingredients}`

  const thisSection = thisWeek.length
    ? `RECIPES THIS WEEK:\n${thisWeek.map(formatRecipe).join('\n\n')}`
    : ''

  const nextSection = nextWeek.length
    ? `RECIPES NEXT WEEK (already planned):\n${nextWeek.map(formatRecipe).join('\n\n')}`
    : ''

  return `${thisSection}\n\n${nextSection}\n\n
Identify shared ingredients across these recipes that have waste risk — things that come in quantities larger than one recipe needs: produce, dairy, opened cans, fresh herbs, specialty ingredients. Exclude pantry staples (salt, pepper, oil, sugar, flour, dried spices, vinegar, soy sauce, common condiments).

Return ONLY valid JSON, no markdown:
[
  {
    "ingredient": "ingredient name",
    "recipe_ids": ["id1", "id2"],
    "waste_risk": "high" | "medium"
  }
]

Return [] if no meaningful overlap exists.`
}
```

**Call the LLM and parse:**

Use `LLM_MODEL_FAST` — ingredient overlap is a classification task and speed matters here (8s budget). Use the system role to keep the model on task:

```typescript
const raw = await llm({
  model:     LLM_MODEL_FAST,
  system:    'You are analyzing recipe ingredient lists to identify ingredient overlap that could help reduce food waste. Return only valid JSON arrays.',
  user:      buildOverlapPrompt(thisWeekRecipes, nextWeekRecipes),
  maxTokens: 1024,
})

type RawOverlapEntry = {
  ingredient: string
  recipe_ids: string[]
  waste_risk: 'high' | 'medium'
}

const entries = parseLLMJsonSafe<RawOverlapEntry[]>(raw)
if (!entries || !Array.isArray(entries)) return new Map()
```

**Build the result map:**

For each overlap entry, add a `WasteMatch` to every recipe in `recipe_ids`. The `shared_with` field lists the *other* recipe_ids (not the current one). Set `has_next_week: true` if any of those others are from `nextWeekRecipes`:

```typescript
const nextWeekIds = new Set(nextWeekRecipes.map((r) => r.recipe_id))
const result = new Map<string, WasteMatch[]>()

for (const entry of entries) {
  const { ingredient, recipe_ids, waste_risk } = entry
  if (!ingredient || !Array.isArray(recipe_ids) || recipe_ids.length < 2) continue

  for (const id of recipe_ids) {
    const others = recipe_ids.filter((r) => r !== id)
    const match: WasteMatch = {
      ingredient,
      waste_risk,
      shared_with:   others,
      has_next_week: others.some((r) => nextWeekIds.has(r)),
    }
    const existing = result.get(id) ?? []
    result.set(id, [...existing, match])
  }
}

return result
```

### `getPrimaryWasteBadgeText`

Pure function — no async, no LLM. Called server-side in the suggest route.

```typescript
export function getPrimaryWasteBadgeText(matches: WasteMatch[]): string {
  if (!matches.length) return ''

  if (matches.length >= 2) {
    return `Uses up ${matches.length} ingredients`
  }

  const match = matches[0]!
  if (match.has_next_week) {
    return "Pairs with next week's plan"
  }
  // Sort: high-risk first, then pick the first (highest priority)
  return `Uses up your ${match.ingredient}`
}
```

For a single match with `has_next_week: false`, return `"Uses up your {ingredient}"`. For high vs medium priority when there are multiple matches (which would already hit the `>= 2` branch), no additional sorting is needed.

---

## 7. `app/api/plan/suggest/route.ts` — extend

**File:** `app/api/plan/suggest/route.ts`

Add imports at the top:

```typescript
import { detectWasteOverlap, getPrimaryWasteBadgeText, type RecipeForOverlap } from '@/lib/waste-overlap'
import { callLLM } from '@/lib/llm'
```

The following steps are added **after** `validateSuggestions` produces `validated` (after line 110) and **before** the final `return NextResponse.json`.

### Step 1 — Fetch next week's saved plan (if `include_next_week_plan` is true)

Calculate next week's start date and query the DB directly (do not call the plan API route):

```typescript
let nextWeekRecipes: RecipeForOverlap[] = []

if (body.include_next_week_plan) {
  const nextWeekDate = new Date(week_start)
  nextWeekDate.setDate(nextWeekDate.getDate() + 7)
  const nextWeekStart = nextWeekDate.toISOString().slice(0, 10)

  // Find next week's plan (scoped to household or user)
  let nextPlanQ = db.from('meal_plans').select('id').eq('week_start', nextWeekStart)
  nextPlanQ = scopeQuery(nextPlanQ, user.id, ctx)
  const { data: nextPlan } = await nextPlanQ.maybeSingle()

  if (nextPlan?.id) {
    const { data: entries } = await db
      .from('meal_plan_entries')
      .select('recipe_id, recipes(title, ingredients)')
      .eq('meal_plan_id', nextPlan.id)

    nextWeekRecipes = (entries ?? [])
      .map((e) => {
        const r = e.recipes as { title: string; ingredients: string | null } | null
        return {
          recipe_id:   e.recipe_id,
          title:       r?.title ?? '',
          ingredients: r?.ingredients ?? '',
        }
      })
      .filter((r) => r.ingredients.trim() !== '')
  }
}
```

### Step 2 — Fetch ingredients for this week's suggestions

Extract all unique recipe_ids from `validated` and fetch their ingredient text:

```typescript
const suggestedIds = new Set<string>()
for (const day of validated) {
  for (const mts of day.meal_types) {
    for (const opt of mts.options) {
      suggestedIds.add(opt.recipe_id)
    }
  }
}

const { data: thisWeekData } = await db
  .from('recipes')
  .select('id, title, ingredients')
  .in('id', [...suggestedIds])

const thisWeekRecipes: RecipeForOverlap[] = (thisWeekData ?? [])
  .filter((r) => r.ingredients)
  .map((r) => ({
    recipe_id:   r.id,
    title:       r.title,
    ingredients: r.ingredients!,
  }))
```

### Step 3 — Run overlap detection with timeout

Race the overlap detection against an 8-second timeout. On timeout or any error, `wasteMap` is `null` and suggestions are returned without badges:

```typescript
let wasteMap: Map<string, WasteMatch[]> | null = null

if (thisWeekRecipes.length > 0) {
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), WASTE_DETECTION_TIMEOUT_MS),
  )

  wasteMap = await Promise.race([
    detectWasteOverlap(thisWeekRecipes, nextWeekRecipes, callLLM).catch(() => null),
    timeoutPromise,
  ])
}
```

Define `WASTE_DETECTION_TIMEOUT_MS = 8000` as a module-level constant in this route file.

### Step 4 — Re-rank and attach badge text

If `wasteMap` is non-null, sort options within each meal slot by waste score (higher = more matches = higher priority), and attach `waste_matches` and `waste_badge_text` to each suggestion:

```typescript
if (wasteMap) {
  for (const day of validated) {
    for (const mts of day.meal_types) {
      // Attach waste data to each option
      for (const opt of mts.options) {
        const matches = wasteMap.get(opt.recipe_id)
        if (matches?.length) {
          opt.waste_matches  = matches
          opt.waste_badge_text = getPrimaryWasteBadgeText(matches)
        }
      }

      // Re-rank: higher waste_score (more matches) first
      mts.options.sort((a, b) => {
        const scoreA = a.waste_matches?.length ?? 0
        const scoreB = b.waste_matches?.length ?? 0
        return scoreB - scoreA
      })
    }
  }
}
```

The `validated` DaySuggestions array is mutated in place before the final return. Return it as before:

```typescript
return NextResponse.json({ days: validated })
```

---

## 8. `components/plan/SuggestionMealSlotRow.tsx` — add waste badge

**File:** `components/plan/SuggestionMealSlotRow.tsx`

Add import at the top:

```typescript
import { Leaf } from 'lucide-react'
```

Inside the `options.map()` loop (line 147), find the section that renders `opt.reason` (lines 161–163):

```tsx
{opt.reason && (
  <p className="text-xs text-stone-400 italic mt-0.5">{opt.reason}</p>
)}
```

Add the waste badge **immediately after** this block, still inside the `flex-1 min-w-0` div (before line 164's closing tag):

```tsx
{opt.waste_badge_text && (
  <div
    className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium"
    style={{ backgroundColor: '#FFF0C0', color: '#5C4A00' }}
  >
    <Leaf size={10} className="flex-shrink-0" />
    {opt.waste_badge_text}
  </div>
)}
```

No other changes to this component.

---

## 9. Business logic rules

1. **Overlap detection is always a second LLM call**, separate from suggestion generation. If the first pass fails, the route already returns an error before reaching overlap detection.
2. **Timeout at 8 seconds** — on timeout, `wasteMap` is `null` and `validated` is returned without waste data. This must never throw or block the response.
3. **LLM error → no badges** — the `.catch(() => null)` in the race ensures any LLM failure is silently swallowed.
4. **Re-ranking is a soft sort** — it reorders options within the LLM's existing suggestions. It does not add or remove recipes, and does not override cooldown or dietary exclusions (those are applied before suggestions reach this step).
5. **`include_next_week_plan` defaults to `true`** — callers can pass `false` to skip the next-week fetch.
6. **Next week plan is read-only** — the overlap query only reads `meal_plan_entries`; it does not modify next week's plan.
7. **Intra-week overlap counts** — if no next-week plan exists, `nextWeekRecipes` is `[]`. `detectWasteOverlap` still runs and catches overlap between this week's suggestions (e.g. two recipes both using spinach).
8. **Ingredient-less recipes are excluded** — recipes with null/empty `ingredients` are filtered out of `thisWeekRecipes` and `nextWeekRecipes` before sending to the LLM.
9. **`parseLLMJsonSafe` handles fence stripping** — do not add manual fence stripping; `extractJsonFromText` inside `parseLLMJsonSafe` already handles ` ```json ` fences.
10. **Household scope for next week plan** — the `meal_plans` query for next week uses `scopeQuery(nextPlanQ, user.id, ctx)` so household plans are correctly retrieved.
11. **Badge text is pre-computed server-side** — the component renders `waste_badge_text` as a plain string. `getPrimaryWasteBadgeText` is never called from the client.

---

## 10. Test cases

| ID | Test |
|----|------|
| T01 | Overlap detection runs after suggestion generation |
| T02 | `detectWasteOverlap` returns correct matches for a shared ingredient |
| T03 | Pantry staples (salt, oil) are not returned as waste matches |
| T04 | Produce and dairy are returned as waste matches |
| T05 | `waste_matches` attached to correct `recipe_id` in response |
| T06 | Suggestion with `waste_badge_text` shows amber badge in UI |
| T07 | Badge text: single match, no next-week → "Uses up your {ingredient}" |
| T08 | Badge text: 2+ matches → "Uses up 2 ingredients" |
| T09 | Badge text: shared with next week → "Pairs with next week's plan" |
| T10 | No badge when `waste_matches` is absent or empty |
| T11 | Next week's saved plan is fetched and included in overlap analysis |
| T12 | No next-week plan — overlap runs on current week only |
| T13 | Overlap detection timeout (>8s) returns suggestions without badges |
| T14 | Overlap detection LLM failure returns suggestions without badges |
| T15 | Re-ranking puts higher `waste_score` options first |
| T16 | Waste-aware boost does not add or remove recipes from the pool |
| T17 | Household: next-week plan fetch scoped to household |
| T18 | `getPrimaryWasteBadgeText` — single high-risk match returns ingredient name |
| T19 | `include_next_week_plan: false` skips next-week fetch entirely |
| T20 | Recipes with no ingredients text are excluded from overlap analysis |

---

## 11. Out of scope

Per brief:
- Pantry integration (using pantry contents in waste detection — future)
- Waste awareness in Recipe Generation or Discovery (Brief 22)
- Grocery list deduplication
- Waste savings in dollars or weight
- User-configurable waste sensitivity
- Planning window beyond 2 weeks
