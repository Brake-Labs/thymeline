# Brief 22 — Cohesive AI Context

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/cohesive-ai-context`
**Target:** PR into `main`
**Depends on:** Brief 20 (Taste Profile), Brief 21 (Waste-Aware Planning) merged to main

---

## User Story

As a Thymeline user, I want Recipe Discovery, Recipe Generation, and AI Recipe
Edit to feel like they know me — surfacing recipes I'll actually like, flagging
when a generated recipe would help use up something already in my plan, and
making AI edits that respect my household's cooking style without me having to
explain it every time.

---

## Core Concept

Brief 20 built the taste profile and injected it into Help Me Plan. Brief 21
added waste-awareness to Help Me Plan. This brief extends both signals to the
three remaining AI surfaces:

- **Recipe Discovery** (`POST /api/discover`) — filter and rank results using
  the taste profile; flag when a discovered recipe shares waste-risk ingredients
  with the current plan
- **Recipe Generation** (`POST /api/recipes/generate`) — shape generated recipes
  using the taste profile; flag when the generated recipe could use up something
  already in the plan
- **AI Recipe Edit** (`POST /api/recipes/[id]/ai-edit`) — inject cooking style
  and household context so edits feel natural and consistent with how the
  household actually cooks

All three surfaces use the existing `deriveTasteProfile()` from
`lib/taste-profile.ts` (Brief 20) and the existing `detectWasteOverlap()` from
`lib/waste-overlap.ts` (Brief 21). No new infrastructure is needed — this brief
is about wiring existing systems together.

---

## 1. Recipe Discovery

### Changes to `POST /api/discover`

**Taste profile injection:**

1. Call `deriveTasteProfile(userId, db)` after auth
2. Add a taste context section to the discovery system prompt:

```
USER TASTE PROFILE
------------------
Top tags from recent cooking: {top_tags}
Preferred tags: {preferred_tags}
Avoided tags: {avoided_tags}
Household context: {meal_context}

Prioritise recipes that match the user's cooking style and preferences.
Do not suggest recipes with avoided tags.
Recipes matching top tags or preferred tags should rank higher.
```

3. Pre-filter: exclude any recipe whose tags overlap with `avoided_tags` before
   sending to the LLM (same pattern as Help Me Plan's disliked pre-filtering)

**Waste flag:**

1. Fetch the current week's saved plan (if any) for the user/household
2. For each discovered recipe returned, run a lightweight waste check:
   - Call `detectWasteOverlap()` with the discovered recipe + current plan recipes
   - If overlap detected, attach `waste_matches` to the result
3. Show the same amber "Uses up your {ingredient}" badge on discovery result
   cards when `waste_matches` is non-empty

**Response shape update:**
```typescript
{
  recipes: {
    recipe_id:      string
    title:          string
    // existing fields...
    waste_matches?: {
      ingredient:  string
      waste_risk:  'high' | 'medium'
    }[]
  }[]
}
```

**Performance:**
- Taste profile derivation and plan fetch run in parallel with the main
  discovery LLM call where possible
- Waste overlap check runs after discovery results are returned, in a single
  batch (send all discovered recipes + plan recipes to overlap detection at once,
  not one recipe at a time)
- If waste overlap times out (>5s), return results without badges

---

## 2. Recipe Generation

### Changes to `POST /api/recipes/generate`

**Taste profile injection:**

1. Call `deriveTasteProfile(userId, db)` after auth
2. Add a taste context section to the generation system prompt:

```
USER TASTE PROFILE
------------------
Top tags from recent cooking: {top_tags}
Household context: {meal_context}
Cooking frequency: {cooking_frequency}

Generate a recipe that fits this household's cooking style and preferences.
If meal_context mentions time constraints, respect them.
If meal_context mentions dietary preferences, respect them even if not
explicitly listed in the dietary_restrictions field.
```

3. Do not inject `loved_recipe_ids` or `disliked_recipe_ids` into generation —
   generation is for new recipes, not repeats. Top tags and meal_context are
   sufficient signals.

**Waste flag:**

1. Fetch the current week's saved plan (if any)
2. After the recipe is generated, run waste overlap detection between the
   generated recipe and the current week's plan
3. If overlap detected, show a waste badge in the generation result preview:
   - Badge: amber pill, "Uses up your {ingredient}" (same style as planning)
   - Placement: below the generated recipe title in the preview card
   - This is informational — it doesn't change the generated recipe

**Response shape update:**
```typescript
{
  // existing fields...
  waste_matches?: {
    ingredient:  string
    waste_risk:  'high' | 'medium'
  }[]
}
```

---

## 3. AI Recipe Edit

### Changes to `POST /api/recipes/[id]/ai-edit`

**Taste profile injection:**

AI Edit already has access to the recipe and the conversation history. The taste
profile adds household cooking style context so the AI makes edits that feel
natural for this household — substitutions they'd actually have on hand, spice
levels that match their tolerance, portion sizes that match their household size.

1. Call `deriveTasteProfile(userId, db)` after auth
2. Add a household context section to the AI Edit system prompt:

```
HOUSEHOLD CONTEXT
-----------------
{meal_context}

Cooking style signals: {top_tags}

When suggesting substitutions or modifications:
- Prefer ingredients consistent with this household's cooking style
- Respect any dietary preferences mentioned in the household context
- Adjust portions if the household context implies a specific household size
- Keep suggestions practical for this household's skill level and time constraints
```

3. Inject `meal_context` and `top_tags` only — not loved/disliked recipe IDs
   (not relevant for editing a specific recipe)

**No waste flag for AI Edit** — the user is editing a specific recipe for
tonight, not planning a week. Waste awareness doesn't apply in this context.

---

## Shared Infrastructure

All three routes follow the same pattern:

```typescript
// After auth, in parallel:
const [profile, currentPlan] = await Promise.all([
  deriveTasteProfile(userId, db),
  fetchCurrentWeekPlan(userId, db)   // returns [] if no plan
])
```

### `lib/plan-utils.ts` — add `fetchCurrentWeekPlan()`

```typescript
export async function fetchCurrentWeekPlan(
  userId: string,
  db: SupabaseClient
): Promise<RecipeForOverlap[]>
```

Fetches the current week's saved plan entries with recipe titles and ingredients.
Returns empty array if no plan exists. Used by Discover, Generate, and (already)
Plan Suggest.

---

## UI Changes

### Discovery result cards (`components/discover/DiscoverResultCard.tsx`)

- Add waste badge rendering (same amber pill, same `Leaf` icon from lucide-react)
- Badge appears below the recipe title if `waste_matches` is non-empty
- Same text logic as planning: "Uses up your {ingredient}" or "Uses up N ingredients"

### Generation result preview (`components/recipes/GenerateRecipeTab.tsx`)

- Add waste badge rendering below the generated recipe title
- Same style and logic as above
- Badge disappears if the user regenerates with tweaks and the new recipe
  no longer has overlap

### AI Edit sheet (`components/recipes/AIEditSheet.tsx`)

- No UI changes — the taste profile injection is invisible to the user
- The AI simply makes better, more contextually appropriate edits

---

## Business Logic

1. **Taste profile is always optional context** — if derivation fails or
   returns an empty profile, all three routes continue normally without
   profile context. No errors surfaced to the user.

2. **Waste overlap is always optional** — if `fetchCurrentWeekPlan` returns
   empty or waste detection times out, routes continue without badges. Fail
   silently.

3. **Avoided tags are pre-filtered in Discover** — same hard exclusion as
   Help Me Plan. Recipes with avoided tags never appear in results.

4. **Avoided tags are soft signals in Generate** — generation produces a single
   recipe; if the user asked for something that conflicts with avoided tags
   (e.g. "make me a beef stew" when beef is avoided), the explicit request
   takes precedence. The profile is context, not a veto.

5. **AI Edit respects the user's explicit request** — if the user asks AI Edit
   to add an ingredient they normally avoid, honour the request. The profile
   informs defaults and suggestions, it doesn't override user intent.

6. **Waste overlap runs on the current week only** — unlike planning (which
   looks two weeks ahead), Discover and Generate only check against the current
   week's saved plan. The rationale: discovered and generated recipes are
   typically for immediate use, not multi-week planning.

7. **Batch waste detection** — for Discover (which may return 5–10 results),
   send all results to overlap detection in a single LLM call, not one call
   per recipe. The overlap detection prompt handles multiple candidate recipes
   at once.

8. **`fetchCurrentWeekPlan` is shared** — extracted to `lib/plan-utils.ts` so
   it isn't duplicated across three routes.

9. **LLM model** — all three routes use `LLM_MODEL_CAPABLE` (already the case
   for AI Edit; confirm for Discover and Generate).

10. **JSON fence stripping** — all LLM responses parsed with fence stripping
    per the existing codebase pattern.

---

## Test Cases

| # | Test case |
|---|---|
| T01 | deriveTasteProfile called in discover route |
| T02 | Discover results exclude recipes with avoided tags |
| T03 | Discover system prompt includes top_tags and meal_context |
| T04 | Discover waste overlap check runs against current week plan |
| T05 | Discover result with waste match shows amber badge |
| T06 | Discover result without waste match shows no badge |
| T07 | Discover waste timeout returns results without badges |
| T08 | deriveTasteProfile called in generate route |
| T09 | Generate system prompt includes top_tags and meal_context |
| T10 | Generate waste overlap check runs against current week plan |
| T11 | Generated recipe with waste match shows amber badge in preview |
| T12 | Generated recipe without waste match shows no badge |
| T13 | Regenerating with tweaks re-evaluates waste matches |
| T14 | deriveTasteProfile called in ai-edit route |
| T15 | AI Edit system prompt includes meal_context and top_tags |
| T16 | AI Edit does not include loved/disliked recipe IDs in prompt |
| T17 | AI Edit has no waste badge (by design) |
| T18 | Empty taste profile produces no errors in any route |
| T19 | No current week plan produces no errors in any route |
| T20 | fetchCurrentWeekPlan returns empty array when no plan exists |
| T21 | Batch waste detection sends all discover results in single LLM call |
| T22 | All three routes use LLM_MODEL_CAPABLE |

---

## Out of Scope

- Novelty nudging / gradual cuisine expansion (future brief)
- Waste awareness in AI Edit
- Waste awareness looking two weeks ahead in Discover/Generate
  (current week only for these surfaces)
- Surfacing the taste profile to the user
- Per-surface preference overrides (e.g. "don't use my profile for Discovery")
- Pantry contents integration into Discover/Generate waste detection
