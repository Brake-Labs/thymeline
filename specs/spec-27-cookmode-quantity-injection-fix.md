# Spec 27 — Cook-Mode Step Quantity Injection Fix

**Brief:** brief-15-cook-mode (follow-up bug fix)
**Status:** Draft — awaiting owner approval

---

## Summary

The cook-mode step quantity injection system (`injectStepQuantities`) has two bugs
caused by extracting quantities from formatted strings via `indexOf`/`slice` instead
of using the structured data that `parseIngredientLine` already provides:

1. **`idx > 0` bug** — When an ingredient's `rawName` starts at position 0 in the
   scaled line (e.g. `"chicken breasts"` with no amount), `idx > 0` is false and the
   quantity is silently dropped even when one exists. Specifically, `"3 chicken breasts"`
   is scaled to `"3 chicken breasts"` where `rawName = "chicken breasts"` appears at
   index 2, but ingredients whose rawName happens to start at index 0 in the formatted
   string would produce an empty quantity.

2. **Null-unit bug** — When an ingredient has an amount but no unit (e.g. `"3 eggs"`),
   `scaleIngredients` formats it as `"3 eggs"`. Slicing before `rawName` yields `"3 "`
   which works accidentally, but the approach is fragile — it relies on string position
   rather than structured data.

The fix replaces the `scaleIngredients()` → `indexOf` → `slice` pipeline with direct
use of `parseIngredientLine()` + arithmetic scaling + `formatFraction()` to build
quantity strings from structured fields. Additionally, `StepIngredientPanel` is unified
with the injection system's matching logic so the side panel and inline highlights
always agree on which ingredients belong to which step.

---

## DB changes

None.

---

## API routes

None. All changes are client-side / shared utility code.

---

## UI components

### Modified

- **`components/cook/StepIngredientPanel.tsx`** — Replace `matchStepIngredients()`
  matching logic (currently rawName-only regex) with the same matching strategy used
  by `injectStepQuantities`: full-name match → last-word fallback → ambiguity guards.
  No visual changes.

### Unchanged

- `components/cook/renderHighlighted.tsx` — renders highlight ranges, no logic changes
- `components/cook/IngredientChecklist.tsx` — uses `scaleIngredients()` for display, unaffected
- Cook page, API route, step ordering — all unchanged

---

## Business logic

### 1. `lib/scale-ingredients.ts` — New `scaleIngredient()` (singular) export

Add a new function that returns structured data instead of a formatted string:

```typescript
export interface ScaledIngredient {
  amount: number | null
  unit: string | null
  rawName: string
  formatted: string  // for display in ingredient panel
}

export function scaleIngredient(
  line: string,
  baseServings: number,
  targetServings: number,
): ScaledIngredient
```

**Rules:**
- Calls `parseIngredientLine(line)` to get structured `{ amount, unit, rawName }`
- If `amount` is null, returns `{ amount: null, unit: null, rawName, formatted: line }`
- Computes `scaledAmount = amount * (targetServings / baseServings)` (guard `baseServings === 0` → treat as 1)
- Builds `formatted` the same way `scaleIngredients` currently does (for backward compat)
- The existing `scaleIngredients()` (plural) function stays unchanged — it is used by
  `IngredientChecklist` and `StepIngredientPanel` for display

### 2. `lib/inject-step-quantities.ts` — Rewrite quantity extraction

**Current (buggy):**
```typescript
const scaled = scaleIngredients(ingredients, originalServings, servings)
const scaledLine = scaled[i] ?? line
const idx = scaledLine.indexOf(rawName)
const quantity = idx > 0 ? scaledLine.slice(0, idx).trim() : ''
```

**New:**
```typescript
const parsed = parseIngredientLine(line)
if (!parsed.rawName) continue
const scaledAmount = parsed.amount !== null
  ? parsed.amount * (servings / (originalServings || 1))
  : null
const quantity = scaledAmount !== null
  ? formatFraction(scaledAmount) + (parsed.unit ? ' ' + parsed.unit : '')
  : ''
```

**Rules the Writer must enforce:**
- Remove the `scaleIngredients()` import and the `const scaled = ...` call
- Import `formatFraction` from `@/lib/scale-ingredients` and `parseIngredientLine` from `@/lib/grocery` (already imported)
- The quantity string is built from structured fields: `formatFraction(scaledAmount)` + optional unit
- When `amount` is null (e.g. "chicken breasts" with no number), `quantity` is `''` — no injection
- When `amount` is present but `unit` is null (e.g. "3 eggs"), `quantity` is just the formatted number (e.g. `"3"`)
- All existing matching logic (primary entries, last-word fallback, ambiguity guards, inline quantity detection, cross-step dedup) stays identical
- All 14 existing tests must continue to pass without modification

### 3. `components/cook/StepIngredientPanel.tsx` — Unify matching logic

**Current:** `matchStepIngredients()` uses only `rawName` with a word-boundary regex.
Steps like `"heat oil in pan"` won't match `"2 tbsp olive oil"` because it checks only
the full `rawName` `"olive oil"`, not the last-word fallback `"oil"`.

**New:** Apply the same matching strategy as `injectStepQuantities`:
1. Primary match: full `rawName` (stripped to pre-comma portion) with word-boundary regex
2. Fallback match: last word of multi-word names, subject to:
   - Guard 1: full name must NOT appear in the step text (prevents shadowing)
   - Guard 2: fallback word must be unambiguous (only one ingredient maps to it)
3. Return the scaled display lines for all matched ingredients

**Implementation note:** The Writer should extract the shared matching logic into a
reusable helper (e.g. `matchIngredientNames()` in `inject-step-quantities.ts` or a
shared module) rather than duplicating the fallback + guard logic. Both
`injectStepQuantities` and `matchStepIngredients` should call this helper.

---

## Test cases

All existing 14 tests in `inject-step-quantities.test.ts` (T50–T63, T66–T67) must
continue to pass unchanged.

### New tests to add:

**T68: Ingredient with no amount — no quantity injected**
```
Input:  step = "season the chicken breasts"
        ingredients = "chicken breasts"
        servings = 4, originalServings = 4
Expect: text = "season the chicken breasts" (unchanged)
        highlights = [] (empty — no quantity to inject)
```

**T69: Ingredient with amount but no unit — injects number only**
```
Input:  step = "crack the eggs into the bowl"
        ingredients = "3 eggs"
        servings = 4, originalServings = 4
Expect: text = "crack the 3 eggs into the bowl"
        highlights covering "3"
```

Note: T60 already covers `"3 large eggs"` via last-word fallback. T69 tests the
direct single-word `rawName` case where `eggs` is the full rawName and `unit` is null.

**T70: Ingredient whose rawName starts at position 0 in formatted line (idx > 0 regression)**
```
Input:  step = "dice the chicken breasts"
        ingredients = "3 chicken breasts"
        servings = 4, originalServings = 4
Expect: text = "dice the 3 chicken breasts"
        highlights covering "3"
```

This is the core regression — with the old `indexOf`/`slice` approach, `rawName`
`"chicken breasts"` appears at position 2 in `"3 chicken breasts"`, so `idx > 0` is
true and works. But the fix ensures we never rely on string position at all.

Also add a variant where rawName truly IS at position 0:
```
Input:  step = "season the chicken"
        ingredients = "chicken"
        servings = 4, originalServings = 4
Expect: text = "season the chicken" (no amount → no injection)
        highlights = []
```

**T71: Compound unit ingredient (e.g. "14.5-oz can")**
```
Input:  step = "add the diced tomatoes to the pot"
        ingredients = "1 14.5-oz can diced tomatoes"
        servings = 8, originalServings = 4
Expect: text includes quantity before "diced tomatoes"
        quantity reflects 2× scaling
        highlights covering the quantity portion
```

Note: This test depends on how `parseIngredientLine` handles compound units like
`"14.5-oz can"`. The Writer should verify parsing behavior and adjust expectations
accordingly — the goal is to confirm the new structured approach handles compound
units without the `indexOf` bug.

**T72: StepIngredientPanel matching parity — last-word fallback**
```
Input:  step = "heat oil in pan"
        ingredients = "2 tbsp olive oil"
        baseServings = 4, targetServings = 4
Expect: matchStepIngredients returns ["2 tbsp olive oil"]
        (currently returns [] because it only checks full "olive oil")
```

**T73: StepIngredientPanel matching parity — ambiguity guard**
```
Input:  step = "add the sauce to the pan"
        ingredients = "1/4 cup soy sauce\n2 tbsp fish sauce"
        baseServings = 4, targetServings = 4
Expect: matchStepIngredients returns [] (ambiguous "sauce" suppressed)
```

---

## Out of scope

- **No changes to `renderHighlighted.tsx`** — it renders ranges, no logic
- **No changes to `IngredientChecklist.tsx`** — uses `scaleIngredients()` for the ingredients tab display
- **No changes to the cook page, API route, or step ordering**
- **No changes to `parseIngredientLine()`** — the parser is assumed correct as-is
- **No changes to `scaleIngredients()` (plural)** — remains for backward compat
- **No new API routes or DB migrations**

---

Awaiting owner approval before Writer proceeds.
