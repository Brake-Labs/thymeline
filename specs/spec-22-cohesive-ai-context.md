# Spec 22 — Cohesive AI Context

**Brief:** `briefs/brief-22-cohesive-ai-context.md`
**Branch:** `feature/cohesive-ai-context` (cut from `staging`)
**Depends on:** Brief 20 (Taste Profile) merged, Brief 21 (Waste-Aware Planning) merged
**Status:** Approved — Writer may proceed

---

## 1. Summary

Wire the existing `deriveTasteProfile()` (Brief 20) and `detectWasteOverlap()` (Brief 21) into three routes that currently have no profile awareness. Each surface gets a different depth of integration:

| Surface | Taste profile | Waste badge |
|---|---|---|
| Recipe Discovery (`POST /api/discover`) | Ranking + avoided-tag filter | ✓ vs current week's plan |
| Recipe Generation (`POST /api/recipes/generate`) | System prompt context | ✓ vs current week's plan |
| AI Recipe Edit (`POST /api/recipes/[id]/ai-edit`) | System prompt context only | ✗ (not applicable) |

No new DB schema. No new migrations.

---

## 2. Files changed — complete list

| File | Change |
|---|---|
| `lib/plan-utils.ts` | New — `fetchCurrentWeekPlan()` shared utility |
| `types/index.ts` | Add `waste_matches?` and `waste_badge_text?` to `DiscoveryResult` and `GeneratedRecipe` |
| `app/api/discover/route.ts` | Inject taste profile into ranking; post-filter avoided tags; waste detection |
| `app/api/recipes/generate/route.ts` | Replace standalone prefs fetch with taste profile; inject into system prompt; waste detection |
| `app/api/recipes/[id]/ai-edit/route.ts` | Replace `SYSTEM_PROMPT` constant with a function; inject household context |
| `components/discover/DiscoveryCard.tsx` | Render waste badge |
| `components/recipes/GenerateRecipeTab.tsx` | Render waste badge in generated recipe preview |

**Note on component name:** the brief references `DiscoverResultCard.tsx` but the actual file is `components/discover/DiscoveryCard.tsx`.

---

## 3. No migrations

All changes are in API route logic and UI components. No DB schema changes.

---

## 4. Types (`types/index.ts`)

**`DiscoveryResult`** (lines 248–260) — add two optional fields:

```typescript
export interface DiscoveryResult {
  title:          string
  url:            string
  site_name:      string
  description:    string | null
  suggested_tags: string[]
  vault_match?: {
    similar_recipe_title: string
    similarity: 'exact' | 'similar'
  }
  waste_matches?:   Pick<WasteMatch, 'ingredient' | 'waste_risk'>[]   // new
  waste_badge_text?: string                                             // new
}
```

**`GeneratedRecipe`** (lines 211–223) — add the same two optional fields:

```typescript
export interface GeneratedRecipe {
  // ... existing fields unchanged ...
  waste_matches?:   Pick<WasteMatch, 'ingredient' | 'waste_risk'>[]   // new
  waste_badge_text?: string                                             // new
}
```

`WasteMatch` is defined in `types/index.ts` by Brief 21 (spec-21). Both Discover and Generate use a slimmed-down shape that omits `shared_with` and `has_next_week` — those are server-internal and not exposed to clients.

---

## 5. `lib/plan-utils.ts` — new file

Shared utility used by all three routes to fetch the current week's saved plan.

```typescript
// server-only — do not import from client components
import { getMostRecentSunday } from '@/lib/date-utils'
import { scopeQuery } from '@/lib/household'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { HouseholdContext } from '@/types'
import type { RecipeForOverlap } from '@/lib/waste-overlap'

export async function fetchCurrentWeekPlan(
  userId: string,
  db: SupabaseClient<Database>,
  ctx: HouseholdContext | null,
): Promise<RecipeForOverlap[]> {
  const weekStart = getMostRecentSunday()   // current week's Sunday

  let planQ = db.from('meal_plans').select('id').eq('week_start', weekStart)
  planQ = scopeQuery(planQ, userId, ctx)
  const { data: plan } = await planQ.maybeSingle()

  if (!plan?.id) return []

  const { data: entries } = await db
    .from('meal_plan_entries')
    .select('recipe_id, recipes(title, ingredients)')
    .eq('meal_plan_id', plan.id)

  return (entries ?? [])
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
```

`getMostRecentSunday()` (from `lib/date-utils.ts` line 15) returns today's week start as a `YYYY-MM-DD` string.

---

## 6. Waste badge text — local helper

For Discover and Generate, waste overlap is always between the new recipe and the *current* plan — the "Pairs with next week's plan" wording from `getPrimaryWasteBadgeText()` (which uses `has_next_week`) does not apply. Both routes use this simpler inline helper instead:

```typescript
function getPlanWasteBadgeText(
  matches: Pick<WasteMatch, 'ingredient' | 'waste_risk'>[],
): string {
  if (!matches.length) return ''
  if (matches.length >= 2) return `Uses up ${matches.length} ingredients`
  return `Uses up your ${matches[0]!.ingredient}`
}
```

Define this function once in `lib/plan-utils.ts` and export it. Import it in both routes.

---

## 7. `app/api/discover/route.ts` — extend

**File:** `app/api/discover/route.ts`

### 7a. Imports

Add at the top:

```typescript
import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap, type RecipeForOverlap } from '@/lib/waste-overlap'
import { fetchCurrentWeekPlan, getPlanWasteBadgeText } from '@/lib/plan-utils'
import { callLLM } from '@/lib/llm'
```

### 7b. Parallel fetch in Step 1

Currently Step 1 (lines 29–42) fetches vault + prefs in parallel. Extend it to also derive the taste profile and fetch the current plan — all four can run in parallel:

```typescript
const [
  { data: vaultRecipes },
  tasteProfile,
  currentPlanRecipes,
] = await Promise.all([
  vaultQuery,
  deriveTasteProfile(user.id, db, ctx ?? null).catch(() => null),
  fetchCurrentWeekPlan(user.id, db, ctx ?? null).catch(() => []),
])
```

Remove the separate `prefsQ` fetch — `mealContext` comes from `tasteProfile?.meal_context ?? null`.

### 7c. Taste profile injection into Step 4 (ranking)

The ranking step (lines 152–209) currently uses `MODEL` (haiku). Update it to use `LLM_MODEL_CAPABLE` — the ranking now involves reasoning about taste preferences.

Add a taste profile section to the ranking prompt (inside the existing `content` string, after the vault context block):

```
${tasteProfile && (tasteProfile.top_tags.length || tasteProfile.preferred_tags.length) ? `
User taste profile:
- Frequently cooked tags: ${tasteProfile.top_tags.join(', ') || 'none'}
- Preferred tags: ${tasteProfile.preferred_tags.join(', ') || 'none'}
- Avoided tags: ${tasteProfile.avoided_tags.join(', ') || 'none'}
Prioritise results matching the user's taste profile. Do not suggest recipes with avoided tags.
` : ''}
```

### 7d. Post-filter avoided tags

After the ranking step produces `rankedResults`, and before the tag-validation step (before line 214), filter out any result whose `suggested_tags` overlap with the user's avoided tags:

```typescript
const avoidedSet = new Set((tasteProfile?.avoided_tags ?? []).map((t) => t.toLowerCase()))
if (avoidedSet.size > 0) {
  rankedResults = rankedResults.filter(
    (r) => !(r.suggested_tags ?? []).some((t) => avoidedSet.has(t.toLowerCase())),
  )
}
```

This runs after the LLM has assigned tags, so the filter is reliable.

### 7e. Waste detection (after Step 5)

After `results` is built (after line 232), add waste detection with a 5-second timeout. Pass discovered recipes as `thisWeekRecipes` and current plan as `nextWeekRecipes`, so `has_next_week` is true for all matches — but use `getPlanWasteBadgeText` (not `getPrimaryWasteBadgeText`) to generate badge copy so plan-specific wording is never shown:

```typescript
const DISCOVER_WASTE_TIMEOUT_MS = 5000

if (currentPlanRecipes.length > 0 && results.length > 0) {
  const thisWeek: RecipeForOverlap[] = results.map((r) => ({
    recipe_id:   r.url,           // use URL as stable ID for discovered recipes
    title:       r.title,
    ingredients: r.description ?? r.title,  // use description as ingredient proxy
  }))

  const wasteMap = await Promise.race([
    detectWasteOverlap(thisWeek, currentPlanRecipes, callLLM).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), DISCOVER_WASTE_TIMEOUT_MS)),
  ])

  if (wasteMap) {
    for (const result of results) {
      const matches = wasteMap.get(result.url)
      if (matches?.length) {
        const slim = matches.map((m) => ({ ingredient: m.ingredient, waste_risk: m.waste_risk }))
        result.waste_matches   = slim
        result.waste_badge_text = getPlanWasteBadgeText(slim)
      }
    }
  }
}
```

Note: discovered recipes have no `recipe_id` — the URL is used as the stable key for the waste map lookup.

Return `results` as before.

---

## 8. `app/api/recipes/generate/route.ts` — extend

**File:** `app/api/recipes/generate/route.ts`

### 8a. Imports

Add:

```typescript
import { deriveTasteProfile } from '@/lib/taste-profile'
import { detectWasteOverlap, type RecipeForOverlap } from '@/lib/waste-overlap'
import { fetchCurrentWeekPlan, getPlanWasteBadgeText } from '@/lib/plan-utils'
```

### 8b. Replace standalone prefs fetch with taste profile

Remove the existing `mealContext` fetch (lines 36–43):

```typescript
// REMOVE these lines:
let mealContext: string | null = null
{
  let prefsQ = db.from('user_preferences').select('meal_context')
  prefsQ = scopeQuery(prefsQ, user.id, ctx)
  const { data: prefsData } = await prefsQ.maybeSingle()
  mealContext = (prefsData as { meal_context?: string | null } | null)?.meal_context ?? null
}
```

Replace with a parallel fetch of taste profile and current plan:

```typescript
const [tasteProfile, currentPlanRecipes] = await Promise.all([
  deriveTasteProfile(user.id, db, ctx ?? null).catch(() => null),
  fetchCurrentWeekPlan(user.id, db, ctx ?? null).catch(() => []),
])

const mealContext = tasteProfile?.meal_context ?? null
```

### 8c. Update system message

The system message (lines 57–81) currently appends `mealContext` as a single line. Expand it to include top tags and cooking frequency from the profile:

Replace:

```typescript
const mealContextLine = mealContext ? `\nHousehold context: ${mealContext}` : ''
const systemMessage = `You are a creative recipe developer. Generate a complete, practical recipe...${mealContextLine}`
```

With:

```typescript
const tasteLines: string[] = []
if (mealContext) {
  tasteLines.push(`Household context: ${mealContext}`)
}
if (tasteProfile?.top_tags.length) {
  tasteLines.push(`Top tags from recent cooking: ${tasteProfile.top_tags.join(', ')}`)
}
if (tasteProfile?.cooking_frequency) {
  tasteLines.push(`Cooking frequency: ${tasteProfile.cooking_frequency}`)
}

const tasteSection = tasteLines.length
  ? `\n\nUSER TASTE PROFILE\n------------------\n${tasteLines.join('\n')}\n\nGenerate a recipe that fits this household's cooking style. If meal_context mentions time constraints or dietary preferences, respect them even if not listed in dietary_restrictions.`
  : ''

const systemMessage = `You are a creative recipe developer. Generate a complete, practical recipe based on the ingredients and preferences provided. The recipe should be realistic, delicious, and something a home cook can make.${tasteSection}

Rules:
...` // rest of systemMessage unchanged
```

Keep the rest of the `systemMessage` string (the Rules block and JSON schema) unchanged.

### 8d. Waste detection (after recipe is built)

After `result` is assembled (after line 178) and before the `return NextResponse.json(result)` (line 180):

```typescript
const GENERATE_WASTE_TIMEOUT_MS = 5000

if (currentPlanRecipes.length > 0 && result.ingredients) {
  const generated: RecipeForOverlap[] = [{
    recipe_id:   '__generated__',
    title:       result.title,
    ingredients: result.ingredients,
  }]

  const wasteMap = await Promise.race([
    detectWasteOverlap(generated, currentPlanRecipes, callLLM).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), GENERATE_WASTE_TIMEOUT_MS)),
  ])

  const matches = wasteMap?.get('__generated__')
  if (matches?.length) {
    const slim = matches.map((m) => ({ ingredient: m.ingredient, waste_risk: m.waste_risk }))
    result.waste_matches   = slim
    result.waste_badge_text = getPlanWasteBadgeText(slim)
  }
}

return NextResponse.json(result)
```

---

## 9. `app/api/recipes/[id]/ai-edit/route.ts` — extend

**File:** `app/api/recipes/[id]/ai-edit/route.ts`

### 9a. Imports

Add:

```typescript
import { deriveTasteProfile } from '@/lib/taste-profile'
import type { TasteProfile } from '@/types'
```

### 9b. Replace the `SYSTEM_PROMPT` constant with a function

Currently `SYSTEM_PROMPT` is a module-level string constant (line 10). Replace it with a function that builds the prompt dynamically:

```typescript
function buildSystemPrompt(profile: TasteProfile | null): string {
  const householdSection = buildHouseholdContext(profile)
  return `You are a helpful cooking assistant making real-time modifications to a recipe based on the cook's needs tonight.${householdSection}

Rules:
- Make only the changes the user requests — don't alter anything else
- Be practical: suggest the best substitution if an ingredient is missing
- Keep the recipe realistic and cookable
- Respond conversationally — briefly confirm what you changed
- Return the COMPLETE modified recipe, not just the changed parts

Return ONLY valid JSON with no prose, preamble, or markdown fences:
{
  "message": "Brief confirmation of what changed (1-2 sentences)",
  "changes": ["specific change 1", "specific change 2"],
  "title": "Recipe title (unchanged unless user asked to rename)",
  "ingredients": "full ingredient list with modifications applied",
  "steps": "full steps with modifications applied",
  "notes": "updated notes or null",
  "servings": 4
}`
}

function buildHouseholdContext(profile: TasteProfile | null): string {
  if (!profile) return ''

  const lines: string[] = []
  if (profile.meal_context) lines.push(profile.meal_context)
  if (profile.top_tags.length) lines.push(`Cooking style signals: ${profile.top_tags.join(', ')}`)

  if (!lines.length) return ''

  return `

HOUSEHOLD CONTEXT
-----------------
${lines.join('\n')}

When suggesting substitutions or modifications:
- Prefer ingredients consistent with this household's cooking style
- Respect any dietary preferences mentioned in the household context
- Adjust portions if the household context implies a specific household size
- Keep suggestions practical for this household's skill level and time constraints`
}
```

### 9c. Derive taste profile and use dynamic prompt

After the ownership check (after line 47), add:

```typescript
const tasteProfile = await deriveTasteProfile(user.id, db, ctx ?? null).catch(() => null)
```

Then update the LLM call (later in the route) to use `buildSystemPrompt(tasteProfile)` instead of the `SYSTEM_PROMPT` constant. Search the route for where `SYSTEM_PROMPT` is passed to `callLLMMultimodal` and replace it.

Do **not** inject `loved_recipe_ids` or `disliked_recipe_ids` — those are not relevant when editing a specific recipe. Only `meal_context` and `top_tags` are used.

---

## 10. `components/discover/DiscoveryCard.tsx` — add waste badge

**File:** `components/discover/DiscoveryCard.tsx`

Add import:

```typescript
import { Leaf } from 'lucide-react'
```

The component's `result` prop is `DiscoveryResult`, which now has optional `waste_badge_text`. Add the badge inside the card, below the recipe title (line 41, after the `<h3>` title element):

```tsx
{result.waste_badge_text && (
  <div
    className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium"
    style={{ backgroundColor: '#FFF0C0', color: '#5C4A00' }}
  >
    <Leaf size={10} className="flex-shrink-0" />
    {result.waste_badge_text}
  </div>
)}
```

No other changes to this component.

---

## 11. `components/recipes/GenerateRecipeTab.tsx` — add waste badge

**File:** `components/recipes/GenerateRecipeTab.tsx`

Add import:

```typescript
import { Leaf } from 'lucide-react'
```

The `generatedRecipe` state (populated after generation, lines 237–275) is of type `GeneratedRecipe`, which now has optional `waste_badge_text`. In the generated recipe preview section, add the badge below the recipe title:

```tsx
{generatedRecipe.waste_badge_text && (
  <div
    className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium"
    style={{ backgroundColor: '#FFF0C0', color: '#5C4A00' }}
  >
    <Leaf size={10} className="flex-shrink-0" />
    {generatedRecipe.waste_badge_text}
  </div>
)}
```

Badge disappears automatically when the user regenerates (because `generatedRecipe` is replaced with a new object that has no `waste_badge_text` unless the new recipe also has overlap).

---

## 12. Business logic rules

1. **All three routes fail silently on taste profile error** — `.catch(() => null)` on `deriveTasteProfile()`. If null, the route proceeds without profile context. No error surfaced to the user.
2. **All three routes fail silently on current plan fetch error** — `.catch(() => [])`. If empty, waste detection is skipped.
3. **Avoid tags are hard-filtered in Discover** — post-filter after LLM ranking assigns tags. Filtered before the response is sent.
4. **Avoid tags are soft signals in Generate** — injected as context only; the user's explicit request takes precedence.
5. **AI Edit respects user intent** — the profile informs the default tone and suggestions, not the outcome of the user's request.
6. **Waste detection current-week only** — Discover and Generate check only the current week's plan (not two weeks ahead). `fetchCurrentWeekPlan` uses `getMostRecentSunday()`.
7. **Batch waste detection for Discover** — all discovered recipes are sent to `detectWasteOverlap` in a single call. The URL is used as the `recipe_id` key in the result map.
8. **Description as ingredient proxy for Discover** — discovered recipes have no structured ingredient text; `description` is passed as the `ingredients` field for `RecipeForOverlap`. The LLM can reason about ingredient overlap from description text.
9. **`getPlanWasteBadgeText` not `getPrimaryWasteBadgeText`** — both Discover and Generate use the simpler helper in `lib/plan-utils.ts` that never shows "Pairs with next week's plan" (irrelevant context for these surfaces).
10. **Waste detection timeouts** — 5 seconds for both Discover and Generate (tighter than the 8 seconds in Help Me Plan, since these surfaces are typically more latency-sensitive).
11. **Discover ranking uses `LLM_MODEL_CAPABLE`** — the existing ranking step uses `MODEL` (haiku); update it to `LLM_MODEL_CAPABLE` since it now involves taste-aware ranking. The web search step already uses `LLM_MODEL_CAPABLE`.
12. **`deriveTasteProfile` with ctx** — the function signature is `(userId, db, ctx)` per spec-20. All three routes pass `ctx ?? null`.

---

## 13. Test cases

| ID | Test |
|----|------|
| T01 | `deriveTasteProfile` called in discover route |
| T02 | Discover results exclude recipes with avoided tags |
| T03 | Discover ranking prompt includes `top_tags` and `meal_context` |
| T04 | Discover waste overlap check runs against current week plan |
| T05 | Discover result with waste match shows amber badge |
| T06 | Discover result without waste match shows no badge |
| T07 | Discover waste timeout (>5s) returns results without badges |
| T08 | `deriveTasteProfile` called in generate route |
| T09 | Generate system prompt includes `top_tags`, `meal_context`, `cooking_frequency` |
| T10 | Generate waste overlap check runs against current week plan |
| T11 | Generated recipe with waste match shows amber badge in preview |
| T12 | Generated recipe without waste match shows no badge |
| T13 | Regenerating with tweaks re-evaluates waste matches |
| T14 | `deriveTasteProfile` called in ai-edit route |
| T15 | AI Edit system prompt includes `meal_context` and `top_tags` when profile is non-empty |
| T16 | AI Edit system prompt does not include `loved_recipe_ids` or `disliked_recipe_ids` |
| T17 | AI Edit has no waste badge (by design) |
| T18 | Empty taste profile produces no errors in any route |
| T19 | No current week plan produces no errors in Discover or Generate |
| T20 | `fetchCurrentWeekPlan` returns empty array when no plan exists |
| T21 | All discovered recipes sent to waste detection in a single call |
| T22 | Discover and Generate ranking step uses `LLM_MODEL_CAPABLE` |

---

## 14. Out of scope

Per brief:
- Novelty nudging / gradual cuisine expansion
- Waste awareness in AI Edit
- Two-week lookahead in Discover/Generate (current week only)
- Surfacing the taste profile to the user
- Per-surface preference overrides
- Pantry contents integration into waste detection
