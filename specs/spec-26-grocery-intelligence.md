# Spec 26 — Grocery List Intelligence (Layers 1+2)

**Brief:** Design doc `katiebrake-main-design-20260410-grocery-redesign.md` (approved 2026-04-10, Layers 1+2 only)
**Branch:** `feature/groceries` (cut from `main`)
**Depends on:** Spec 23 (grocery list generation) merged to main
**Status:** Draft — awaiting owner approval

---

## 1. Summary

Two improvements to the grocery list pipeline that make the output match how
a human actually shops:

1. **Shopping-scale quantities** — expand `PURCHASE_RULES` in `lib/grocery.ts`
   so meats round to 1 lb packages, cheese to 8 oz blocks, produce to whole
   numbers, eggs to half-dozen/dozen, etc. Add an optional `recipeBreakdown`
   field to `GroceryItem` so the UI can show "2 lbs ground beef" at a glance
   with a tap-to-expand detail: "Tacos (0.75 lb) + Bolognese (1 lb) → rounded
   to 2 lb".

2. **LLM-assisted dedup** — after the rule-based `deduplicateItems()` pass,
   send the item list through a Haiku call that identifies remaining duplicates
   the normalizer missed (e.g. "boneless skinless chicken breast" = "chicken
   breast"). Must respect the existing identity rules (thigh ≠ breast,
   scallion ≠ green onion, etc.).

No new DB tables. No changes to export format. No store-aware grouping.

---

## 2. DB changes

**None.** `recipeBreakdown` is added to the `GroceryItem` TypeScript interface
only. It serializes into the existing `grocery_lists.items` JSONB column. Old
rows without the field are handled by making it optional (`?`).

---

## 3. API routes

### 3a. `POST /api/groceries/generate` (existing — modified)

**Change:** Insert two new steps into the pipeline after the existing
dedup/combine logic:

Current pipeline order:
```
resolve ingredients → parse → combine → LLM ambiguous → deduplicateItems → round → suppress → pantry cross-ref → persist
```

New pipeline order:
```
resolve ingredients → parse → combine (+ populate recipeBreakdown) → LLM ambiguous → deduplicateItems → LLM dedup → round → suppress → pantry cross-ref → persist
```

Key points:
- `recipeBreakdown` is populated during `combineIngredients()` (data is already
  available at that point — each `CombineInput` has `recipeTitle`, `scaleFactor`,
  and `parsed.amount`/`parsed.unit`)
- `llmDeduplicateItems()` runs after `deduplicateItems()` and before
  `roundToPurchaseUnits()` — this ensures rounding applies to the final merged
  amounts, not to pre-merge amounts
- The generate route calls the new functions; no new routes needed

**No other API routes are added or changed.**

---

## 4. UI components

### 4a. Recipe breakdown tap-to-expand (existing component — modified)

**File:** `components/groceries/GroceryItemRow.tsx`

Add a tap target on each grocery item row. When tapped, expand to show the
recipe breakdown below the item line:

```
▸ 2 lbs ground beef
  └ Tacos — 0.75 lb
  └ Bolognese — 1 lb
  └ rounded to 2 lb
```

- Only show the expand chevron when `item.recipeBreakdown` exists and has
  more than one entry (single-recipe items don't need a breakdown)
- Collapsed by default
- Use existing Tailwind patterns from the codebase (text-sm text-stone-500
  for the detail lines)

### 4b. No other UI changes

The shopping-scale amounts replace cooking-scale amounts in the same display
position — no new components needed.

---

## 5. Business logic

### 5a. Shopping-scale purchase rules

Expand `PURCHASE_RULES` in `lib/grocery.ts` with these new rules. Insert them
**before** the existing generic count-item rule (which is the catch-all):

| Category | Match condition | Rounding rule |
|---|---|---|
| Ground meat | name contains "ground" AND unit is weight | Round up to nearest 1 lb |
| Chicken (bulk) | name contains "chicken" AND unit is weight | Round up to nearest 0.5 lb |
| Other meat (beef, pork, lamb, turkey, sausage, bacon) | name matches protein keyword AND unit is weight | Round up to nearest 0.5 lb |
| Cheese (block/shred) | name matches cheese keyword AND unit is weight | Round up to nearest 8 oz |
| Produce (count) | section is Produce AND unit is null (count items) | Round up to whole number |
| Produce (weight) | section is Produce AND unit is weight | Round up to nearest 0.5 lb |
| Eggs | name contains "egg" AND unit is count-like or null | Round to nearest 6 (half-dozen) with minimum 6 |

Rules apply in order; first match wins. The existing rules (cans, butter,
garlic, generic count) remain and keep their current positions.

**Important:** The rounding step must happen AFTER LLM dedup so that merged
amounts get rounded correctly (not double-rounded).

### 5b. Recipe breakdown population

Add `recipeBreakdown` tracking to `combineIngredients()`:

```typescript
interface RecipeBreakdownEntry {
  recipe: string
  amount: number | null
  unit:   string | null
}
```

During the combine step, as items are summed, record each contributing recipe's
pre-combined amount. This data is already available in the `CombineInput`
objects — just accumulate it.

For single-recipe items, `recipeBreakdown` has one entry. For multi-recipe
items, it has N entries. The UI decides whether to show the expand based on
length.

When items are further merged by `deduplicateItems()` or `llmDeduplicateItems()`,
concatenate the `recipeBreakdown` arrays.

### 5c. LLM-assisted deduplication

New function: `llmDeduplicateItems(items: GroceryItem[]): Promise<GroceryItem[]>`

**Lives in:** `lib/grocery-llm.ts` (new file — server-only, imports `callLLM`)

Cannot live in `lib/grocery.ts` because that file is imported by client
components and must stay server-import-free. The LLM dedup function imports
`callLLM` which requires Node.js.

**Algorithm:**

1. Extract the list of unique item names from the input
2. If ≤ 3 items, skip the LLM call (not enough to have duplicates worth catching)
3. Build a system prompt that includes:
   - The task: "Group ingredient names that refer to the same shopping item"
   - The **DO NOT merge** list, extracted from `INGREDIENT_SYNONYMS` exclusions
     and the comment block at lines 12-14 of `grocery.ts`:
     ```
     DO NOT merge these — they are distinct items:
     - chicken breast ≠ chicken thigh
     - Italian sausage ≠ sausage
     - scallion ≠ green onion
     - cilantro ≠ coriander
     - flour tortilla ≠ corn tortilla
     - toasted sesame oil ≠ sesame oil
     - whole milk ≠ milk ≠ 2% milk
     ```
   - Instruction: "Only merge. Never split, rename, or add items."
4. Send item names to `LLM_MODEL_FAST` (Haiku) via `callLLM()`
5. Parse the response: expect `{ groups: [{ canonical: string, variants: string[] }] }`
6. For each group with > 1 variant:
   - Find the matching `GroceryItem`s by name
   - Sum their amounts (using `convertUnit()` if units differ)
   - Concatenate their `recipes` arrays (deduplicated)
   - Concatenate their `recipeBreakdown` arrays
   - Use the canonical name from the LLM as the display name
   - Keep the section and isPantry from the first item in the group
7. Return the merged list

**Fallback:** If the LLM call fails (timeout, parse error, rate limit), return
the input unchanged. Log the failure at `warn` level. The rule-based dedup
already ran — LLM dedup is a best-effort enhancement.

**Model:** `LLM_MODEL_FAST` (Haiku). This is simple classification, not
generation. Estimated ~200 tokens per call.

### 5d. Pipeline ordering (enforced in generate route)

The full pipeline after this spec:

```
1. resolveRecipeIngredients()     — vault-first, Firecrawl fallback
2. parseIngredientLine()          — amounts, units, names
3. combineIngredients()           — rule-based combine + recipeBreakdown
4. LLM ambiguous resolution       — existing (conflicting units)
5. deduplicateItems()             — rule-based final dedup
6. llmDeduplicateItems()          — NEW: LLM-assisted semantic dedup
7. roundToPurchaseUnits()         — NEW: expanded purchase rules
8. suppressStapleQuantities()     — existing
9. pantry cross-reference          — existing
10. persist                        — upsert to grocery_lists
```

Steps 6 and 7 are the new additions. Their ordering is critical:
- LLM dedup (6) before rounding (7) so merged amounts get rounded once
- Rounding (7) before suppress (8) so suppressed items don't get rounded first

---

## 6. Files changed — complete list

| File | Change |
|---|---|
| `types/index.ts` | Add optional `recipeBreakdown?: RecipeBreakdownEntry[]` to `GroceryItem`; add `RecipeBreakdownEntry` interface |
| `lib/grocery.ts` | Expand `PURCHASE_RULES` (~8 new rules); populate `recipeBreakdown` in `combineIngredients()`; merge `recipeBreakdown` in `deduplicateItems()` |
| `lib/grocery-llm.ts` | **New file** — `llmDeduplicateItems()` function; exports identity rules as `DO_NOT_MERGE` for testing |
| `app/api/groceries/generate/route.ts` | Import and call `llmDeduplicateItems()` after `deduplicateItems()`, before `roundToPurchaseUnits()` |
| `components/groceries/GroceryItemRow.tsx` | Add tap-to-expand recipe breakdown display |
| `lib/__tests__/grocery.test.ts` | New test cases for purchase rules, recipeBreakdown, LLM dedup |

---

## 7. Test cases

### 7a. Shopping-scale purchase rules (`lib/__tests__/grocery.test.ts`)

| # | Test case | Input | Expected output |
|---|---|---|---|
| T26-01 | Ground meat rounds to 1 lb | 1.73 lb ground beef | 2 lb ground beef |
| T26-02 | Chicken rounds to 0.5 lb | 1.2 lb chicken breast | 1.5 lb chicken breast |
| T26-03 | Cheese rounds to 8 oz | 5 oz cheddar | 8 oz cheddar |
| T26-04 | Cheese > 8 oz rounds to next 8 oz | 12 oz mozzarella | 16 oz mozzarella |
| T26-05 | Produce count rounds up | 2.5 onion (null unit) | 3 onion |
| T26-06 | Produce weight rounds to 0.5 lb | 0.3 lb potato | 0.5 lb potato |
| T26-07 | Eggs round to half-dozen | 4 eggs | 6 eggs |
| T26-08 | Eggs round to dozen | 8 eggs | 12 eggs |
| T26-09 | Existing can rule still works | 1.5 cans diced tomatoes | 2 cans diced tomatoes |
| T26-10 | Existing butter rule still works | 12 tbsp butter | 2 sticks butter |
| T26-11 | Existing garlic rule still works | 6 cloves garlic | 1 head garlic |

### 7b. Recipe breakdown (`lib/__tests__/grocery.test.ts`)

| # | Test case |
|---|---|
| T26-12 | Single recipe item has recipeBreakdown with 1 entry |
| T26-13 | Two recipes with same ingredient produce recipeBreakdown with 2 entries, amounts match pre-combine values |
| T26-14 | recipeBreakdown survives deduplicateItems() merge (arrays concatenated) |
| T26-15 | Items without recipeBreakdown (old persisted data) render without error — null-guard |

### 7c. LLM dedup (`lib/__tests__/grocery.test.ts`)

| # | Test case |
|---|---|
| T26-16 | LLM groups "boneless skinless chicken breast" + "chicken breast" → merged, amounts summed |
| T26-17 | LLM does NOT merge "chicken breast" + "chicken thigh" (identity rule) |
| T26-18 | LLM does NOT merge "scallion" + "green onion" (identity rule) |
| T26-19 | LLM failure returns input unchanged (fallback) |
| T26-20 | ≤ 3 items skips LLM call entirely |
| T26-21 | recipeBreakdown arrays are concatenated when LLM merges items |
| T26-22 | LLM merges items with different units using convertUnit() |

### 7d. Pipeline integration

| # | Test case |
|---|---|
| T26-23 | Full pipeline: combine → dedup → LLM dedup → round produces correct final amounts (no double-rounding) |
| T26-24 | recipeBreakdown shows pre-rounded amounts even after roundToPurchaseUnits() runs |

---

## 8. Out of scope

- **Store-aware grouping** — deferred (Layer 3 in design doc)
- **Export pipeline changes** — deferred (Layer 4 in design doc). Existing
  export formats (plain text, ICS, Apple Shortcuts URL) are unchanged
- **Recipe scaling / scale factor fix** — the `sf = 1` issue noted in the
  design doc's review finding #4 is a pre-existing concern, not introduced by
  this spec. If the Writer discovers it needs fixing for `recipeBreakdown` to
  show correct amounts, they should document the finding but not change scaling
  behavior without a separate approval
- **recipeBreakdown in export text** — the breakdown is UI-only (tap to expand).
  It is NOT included in clipboard/share export. May revisit in a future spec
- **New DB tables** — no `user_store_preferences` or `user_stores`
- **Price comparison, inventory tracking, aisle-by-aisle mode**

---

Awaiting owner approval before Writer proceeds.
