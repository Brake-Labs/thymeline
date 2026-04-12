# Spec 27 — Grocery List Fixes

**Issue:** [#387](https://github.com/Brake-Labs/thymeline/issues/387)
**Branch:** `fix/grocery-387` (cut from `main`)
**Depends on:** Spec 26 (grocery intelligence) merged to main
**Status:** Draft — awaiting owner approval

---

## 1. Summary

Two bugs in the grocery list pipeline:

1. **"pepper" lands in Produce instead of Pantry.** When a recipe says "pepper"
   (meaning black pepper), `assignSection` matches the Produce keyword `'pepper'`
   before it can match Pantry's `'black pepper'`. The standalone word "pepper" in
   a recipe ingredient list almost always means the spice, not a fresh pepper
   (which would be "bell pepper", "red pepper", "jalapeño", etc.).

2. **"3.3 chicken breasts" has a nonsensical unit.** When a recipe lists "2
   chicken breasts", the parser produces `{ amount: 2, unit: null, name:
   'chicken breast' }`. Two recipes combine to "3.3 chicken breasts" — a
   fractional count with no weight unit. The chicken purchase rule only fires
   when `unit` is a weight (`isPurchaseWeight`), so count-based chicken items
   pass through unrounded. The shopper sees "3.3 chicken breasts" instead of
   something like "2 lb chicken breast".

---

## 2. DB changes

**None.** Both fixes are in `lib/grocery.ts` keyword tables and purchase rules.

---

## 3. API routes

**No new or modified routes.** The fixes affect `assignSection()`,
`isPantryStaple()`, and `roundToPurchaseUnits()` which are called by the
existing `POST /api/groceries/generate` route.

---

## 4. UI components

**No UI changes.** The fixes correct the data the UI already renders.

---

## 5. Business logic

### 5a. Fix: "pepper" → Pantry

**Root cause:** The `SECTION_KEYWORDS` array has `'black pepper'` in the Pantry
section and `'pepper'` in the Produce section. `assignSection` uses
`lc.includes(kw)` to match, checking sections in priority order. Pantry comes
before Produce in the array, but `'black pepper'.includes('pepper')` is false
when the input is just `"pepper"` — the check is `input.includes(keyword)`,
not the reverse. So `"pepper"` skips past Pantry's `'black pepper'` and
matches Produce's `'pepper'`.

**Fix:** Add `'pepper'` (bare word) to the Pantry section keywords in
`SECTION_KEYWORDS`. It must appear **before** the Produce section's `'pepper'`
in priority order, which it already does since Pantry precedes Produce.

Also add `'pepper'` to the `PANTRY_KEYWORDS` set so `isPantryStaple('pepper')`
returns true. Currently it only has `'black pepper'`.

**Edge case:** "red pepper", "bell pepper", "chile pepper" should NOT match
Pantry. They won't, because `assignSection` checks keywords in order and these
multi-word names will match their specific Produce keywords first (e.g. "bell
pepper" → Produce's `'bell pepper'`). But bare `"pepper"` will now hit
Pantry's `'pepper'` first. Verify this in tests.

### 5b. Fix: chicken breast count → weight conversion

**Root cause:** When a recipe says "2 chicken breasts", the parser produces
`amount: 2, unit: null`. The chicken purchase rule only fires when
`isPurchaseWeight(unit)` is true. Count-based chicken items (null unit) bypass
the rule entirely.

**Fix:** Add a new purchase rule specifically for count-based chicken items
(unit is null or "piece"/"pieces"). This rule converts the count to an
approximate weight using a standard estimate:

- 1 chicken breast ≈ 0.5 lb (8 oz)

So "3.3 chicken breasts" → 3.3 × 0.5 = 1.65 lb → rounds to 2 lb.

This rule must be inserted **before** the existing weight-based chicken rule
and **before** the generic produce count rule, so it catches chicken counts
before they fall through. It should match names containing "chicken" where the
unit is null or a count-like unit (piece/pieces), excluding items that
already have a weight unit.

The `recipeBreakdown` entries should preserve the original per-recipe amounts
and null units (showing the recipe's count), while the top-level item shows
the converted weight.

---

## 6. Files changed — complete list

| File | Change |
|---|---|
| `lib/grocery.ts` | Add `'pepper'` to Pantry section keywords and `PANTRY_KEYWORDS` set; add count-based chicken purchase rule |
| `lib/__tests__/grocery.test.ts` | New test cases for both fixes |

---

## 7. Test cases

### 7a. Pepper section assignment

| # | Test case | Input | Expected |
|---|---|---|---|
| T27-01 | bare "pepper" → Pantry | `assignSection('pepper')` | `'Pantry'` |
| T27-02 | "black pepper" still → Pantry | `assignSection('black pepper')` | `'Pantry'` |
| T27-03 | "bell pepper" still → Produce | `assignSection('bell pepper')` | `'Produce'` |
| T27-04 | "red bell pepper" still → Produce | `assignSection('red bell pepper')` | `'Produce'` |
| T27-05 | bare "pepper" is pantry staple | `isPantryStaple('pepper')` | `true` |

### 7b. Chicken breast count → weight

| # | Test case | Input | Expected |
|---|---|---|---|
| T27-06 | chicken breast count converts to lb | `roundToPurchaseUnits([item({ name: 'chicken breast', amount: 2, unit: null })])` | `{ amount: 1, unit: 'lb' }` |
| T27-07 | fractional chicken count rounds to 0.5 lb | `roundToPurchaseUnits([item({ name: 'chicken breast', amount: 3.3, unit: null })])` | `{ amount: 2, unit: 'lb' }` (3.3 × 0.5 = 1.65, ceil to 2) |
| T27-08 | chicken thighs count also converts | `roundToPurchaseUnits([item({ name: 'chicken thighs', amount: 4, unit: null })])` | `{ amount: 2, unit: 'lb' }` (4 × 0.5 = 2) |
| T27-09 | chicken weight rule still works | `roundToPurchaseUnits([item({ name: 'chicken breast', amount: 1.2, unit: 'lb' })])` | `{ amount: 1.5, unit: 'lb' }` (unchanged from spec 26) |
| T27-10 | "whole chicken" does NOT convert count to weight | `roundToPurchaseUnits([item({ name: 'whole chicken', amount: 1, unit: null })])` | `{ amount: 1, unit: null }` (1 whole chicken is a valid shopping unit) |

---

## 8. Out of scope

- **Recipe-level unit normalization** — fixing the upstream problem where recipes
  list "chicken breasts" as a count instead of a weight. That would require
  changing how recipes store their ingredients, which is a larger effort.
- **Other count-based protein conversions** — e.g. "4 pork chops" → lb. Could
  be added later but keeping scope tight to the two reported bugs.
- **"pepper" disambiguation via context** — a smarter system could look at
  the amount/unit to distinguish spice pepper (tsp) from produce pepper (whole).
  The simple keyword fix handles the common case correctly.

---

Awaiting owner approval before Writer proceeds.
