# Spec 26 — Thymeline JSON Export/Import Roundtrip Fix

**Issue:** #378 — Exported Recipes Don't Contain Enough Info to Import
**Branch:** `feature/recipes` (existing)
**Depends on:** Spec 17 (bulk import) already implemented

---

## 1. Summary

The Thymeline JSON export/import pipeline has three data-loss gaps that prevent
a seamless account-to-account transfer:

1. **`step_photos`** — exported in the JSON but the parser (`parse-thymeline.ts`)
   ignores them, and the save route (`/api/import/save`) hardcodes `stepPhotos: []`.
   Photos are lost on import.
2. **`source: 'generated'`** — the DB stores this for AI-generated recipes, but
   `ParsedRecipe` and `parsedRecipeSchema` only accept `'scraped' | 'manual'`.
   Generated recipes silently downgrade to `'manual'` on import.
3. **`recipe_history` (cook dates)** — not included in the export at all. When
   transferring to a new account, the user loses all "date made" history.

This spec fixes all three gaps so that exporting all recipes from Account A and
importing them into Account B produces an identical recipe library, including
photos, source provenance, and cook history.

---

## 2. DB Changes

**None.** The existing `recipes`, `recipe_history`, and `custom_tags` tables
already have all the columns needed. No migrations required.

---

## 3. Changes by File

### 3a. Export route — `app/api/recipes/export/json/route.ts`

**Current state:** Exports recipe fields but not `recipe_history`.

**Changes:**

1. **Join `recipe_history`** — after fetching recipes, query `recipe_history`
   for all exported recipe IDs in a single batch query:
   ```
   SELECT recipe_id, made_on FROM recipe_history
   WHERE recipe_id IN (...exportedIds)
   AND <scopeCondition>
   ORDER BY made_on ASC
   ```
2. **Add `history` array to each recipe in the JSON output** — group the
   history rows by `recipe_id` and attach as `"history"`:
   ```json
   {
     "id": "...",
     "title": "Chicken Parm",
     "history": [
       { "made_on": "2026-01-15" },
       { "made_on": "2026-03-02" }
     ],
     ...existing fields...
   }
   ```
   If a recipe has no history entries, `"history"` should be an empty array `[]`.

3. **No other export changes needed** — `step_photos`, `source`, and all other
   fields are already exported correctly.

---

### 3b. `ParsedRecipe` type — `types/index.ts`

**Current state (line 310–325):**
```typescript
export interface ParsedRecipe {
  ...
  source: 'scraped' | 'manual'
}
```

**Changes:**

1. **Add `'generated'` to `source`:**
   ```typescript
   source: 'scraped' | 'manual' | 'generated'
   ```
2. **Add `stepPhotos` field:**
   ```typescript
   stepPhotos: unknown[]  // JSONB pass-through; opaque array of photo objects
   ```
3. **Add `history` field:**
   ```typescript
   history: { madeOn: string }[]  // ISO date strings from recipe_history
   ```

All three new fields default to empty (`[]`) when not present in the import
source, so non-Thymeline import parsers are unaffected.

---

### 3c. Zod schema — `lib/schemas.ts`

**Current `parsedRecipeSchema` (line 264–279):**
```typescript
source: z.enum(['scraped', 'manual']),
```

**Changes:**

1. **Add `'generated'` to source enum:**
   ```typescript
   source: z.enum(['scraped', 'manual', 'generated']),
   ```
2. **Add `stepPhotos`:**
   ```typescript
   stepPhotos: z.array(z.unknown()).default([]),
   ```
3. **Add `history`:**
   ```typescript
   history: z.array(z.object({
     madeOn: z.string(),  // ISO date string, e.g. "2026-01-15"
   })).default([]),
   ```

---

### 3d. Thymeline parser — `lib/import/parse-thymeline.ts`

**Current state:** Ignores `step_photos`, `created_at`, and `history`. Falls
back to `'manual'` when `source` is `'generated'`.

**Changes:**

1. **Parse `step_photos`** — read `r['step_photos']` as an array. If it's an
   array, pass it through. Otherwise default to `[]`:
   ```typescript
   stepPhotos: Array.isArray(r['step_photos']) ? r['step_photos'] : [],
   ```

2. **Accept `'generated'` source** — update the source assignment:
   ```typescript
   source: source === 'scraped' || source === 'manual' || source === 'generated'
     ? source
     : (url ? 'scraped' : 'manual'),
   ```

3. **Parse `history`** — read `r['history']` as an array of objects with
   `made_on` (snake_case from export) and convert to camelCase:
   ```typescript
   history: Array.isArray(r['history'])
     ? r['history']
         .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null)
         .filter((h) => typeof h['made_on'] === 'string')
         .map((h) => ({ madeOn: h['made_on'] as string }))
     : [],
   ```

---

### 3e. Save route — `app/api/import/save/route.ts`

**Current state (line 88–91):**
```typescript
const recipePayload = {
  ...
  source:     recipe.source,
  isShared:   false,
  stepPhotos: [],          // ← hardcoded empty, drops photos
}
```

**Changes:**

1. **Use parsed `stepPhotos` instead of `[]`:**
   ```typescript
   stepPhotos: recipe.stepPhotos ?? [],
   ```

2. **`source` already passes through** — no change needed since the Zod schema
   will now accept `'generated'`.

3. **Insert `recipe_history` rows** — after successfully inserting or replacing
   a recipe, if `recipe.history` has entries, bulk-insert them into
   `recipe_history`:
   ```typescript
   if (recipe.history && recipe.history.length > 0) {
     const recipeId = /* the inserted/replaced recipe ID */
     await db.insert(recipeHistory).values(
       recipe.history.map((h) => ({
         recipeId,
         userId: user.id,
         madeOn: h.madeOn,
       }))
     )
   }
   ```

   **For `'replace'` duplicate action:** delete existing `recipe_history` rows
   for that recipe before inserting the imported ones, so history is fully
   replaced (not merged). This matches the semantics of "replace" — the
   imported recipe fully overwrites the existing one.

   **For `'keep_both'`:** the new recipe gets a new UUID, so history rows are
   simply inserted with the new ID. No conflict.

4. **Get the inserted recipe ID** — the current insert doesn't return the ID.
   Add `.returning({ id: recipes.id })` to the insert statement so the ID is
   available for the history insert. For the replace path, the ID is already
   known (`item.existingId`).

---

### 3f. Other import parsers (no changes needed)

The other parsers (`parse-csv.ts`, `parse-whisk.ts`, `parse-paprika.ts`,
`parse-plan-to-eat.ts`) don't have step photos or history data in their source
formats. They should return the new fields with default empty values:

```typescript
stepPhotos: [],
history: [],
```

**The Writer must add these two fields to the return value of every parser** so
they conform to the updated `ParsedRecipe` interface. This is a mechanical
change — just add two lines to each parser's return object.

---

## 4. UI Components

**No UI changes needed.** The export modal, import wizard, and review table all
work as-is. The new fields are data-layer only — they pass through
transparently. The import review table doesn't need to display step photos or
history entries.

---

## 5. Business Logic Rules

1. **Roundtrip fidelity** — exporting from Account A and importing into
   Account B must produce recipes with identical: title, category, ingredients,
   steps, notes, servings, all time fields, tags, url, image_url, source,
   step_photos, and cook history dates.

2. **`step_photos` are opaque JSONB** — the import pipeline should not validate
   the internal structure of step photo objects. Pass the array through as-is.
   If the array contains URLs to images hosted on the original account's
   storage, those URLs will still work (they're public CDN URLs). This is
   acceptable for v1.

3. **History on replace** — when `duplicateAction === 'replace'`, the imported
   history fully replaces the existing history. Delete existing
   `recipe_history` rows for that recipe before inserting the imported ones.

4. **History on keep_both** — the new recipe gets fresh history from the import.
   The existing recipe's history is untouched.

5. **History on skip** — no history is imported (the recipe itself is skipped).

6. **`source: 'generated'`** must survive the roundtrip. AI-generated recipes
   should retain their provenance so the UI can display them correctly.

7. **Backward compatibility** — exports from older versions of Thymeline that
   lack `history` or `step_photos` fields must still import correctly. The
   parser defaults both to `[]` when absent.

---

## 6. Test Cases

| # | Test case | File(s) affected |
|---|---|---|
| T01 | Export includes `history` array with `made_on` dates for each recipe | `export/json/route.ts` |
| T02 | Export includes empty `history: []` for recipes with no cook dates | `export/json/route.ts` |
| T03 | `parseThymeline` extracts `step_photos` from export JSON | `parse-thymeline.ts` |
| T04 | `parseThymeline` extracts `history` entries and converts `made_on` → `madeOn` | `parse-thymeline.ts` |
| T05 | `parseThymeline` accepts `source: 'generated'` and preserves it | `parse-thymeline.ts` |
| T06 | `parseThymeline` defaults `stepPhotos` to `[]` when field is missing (backward compat) | `parse-thymeline.ts` |
| T07 | `parseThymeline` defaults `history` to `[]` when field is missing (backward compat) | `parse-thymeline.ts` |
| T08 | `parsedRecipeSchema` validates `source: 'generated'` | `schemas.ts` |
| T09 | `parsedRecipeSchema` validates `stepPhotos` as array | `schemas.ts` |
| T10 | `parsedRecipeSchema` validates `history` array with `madeOn` strings | `schemas.ts` |
| T11 | Import save route uses `recipe.stepPhotos` (not hardcoded `[]`) | `import/save/route.ts` |
| T12 | Import save route inserts `recipe_history` rows from `recipe.history` | `import/save/route.ts` |
| T13 | Import save with `replace` deletes old history then inserts imported history | `import/save/route.ts` |
| T14 | Import save with `keep_both` inserts history on the new recipe ID | `import/save/route.ts` |
| T15 | Import save with `skip` does not insert any history | `import/save/route.ts` |
| T16 | Full roundtrip: export → import produces identical recipe data including photos, source, and history | Integration test |
| T17 | Other parsers (CSV, Whisk, Paprika, Plan to Eat) return `stepPhotos: []` and `history: []` | All parser files |

---

## 7. Out of Scope

- Validating or re-hosting step photo URLs (if the CDN URLs become stale, that's
  a future problem)
- Exporting/importing meal plans, grocery lists, or user preferences
- Merging cook history on `replace` (full replacement is the v1 behavior)
- UI changes to display history or photos in the import review table
- `make_again` field from `recipe_history` — not included in export for v1 to
  keep the format simple. Can be added later if needed.

---

Awaiting owner approval before Writer proceeds.
