# Spec 28 — Export Recipe Selection

**Issue:** #368 — Fix Per Recipe Export
**Branch:** `feature/export-selection`

---

## 1. Summary

The BatchExportModal currently filters recipes by title search and tag dropdown,
but there's no way to check/uncheck individual recipes. If you want 8 out of 10
pasta recipes, you can't deselect the 2 you don't want.

This spec adds a scrollable checklist of recipes to the export modal so users
can select exactly which recipes to export. It also raises the PDF export limit
from 50 to 200 recipes.

---

## 2. DB Changes

**None.**

---

## 3. API Routes

### `exportPdfSchema` in `lib/schemas.ts`

**Change:** Raise `.max(50)` to `.max(200)` on the `recipe_ids` array.

No other API changes. The JSON export route already accepts an unbounded `ids`
query param.

---

## 4. UI Components

### `BatchExportModal.tsx` — redesign

The modal currently has: title search, tag dropdown, count label, format picker,
and action buttons. This spec replaces the count label with a scrollable recipe
checklist and adds select/deselect controls.

**New layout (top to bottom):**

1. **Header** — "Export Recipes" + close button (unchanged)
2. **Filters row** — title search + tag dropdown (unchanged, but side-by-side
   on one row to save vertical space)
3. **Select controls** — "Select all" / "Deselect all" text buttons, right-aligned,
   with a count: "X of Y selected"
4. **Recipe checklist** — scrollable list (`max-h-64 overflow-y-auto`) showing
   each filtered recipe as a row with:
   - Checkbox (checked by default)
   - Recipe title
   - Category badge (styled like the recipe list)
5. **Format picker** — PDF Cookbook / JSON Data toggle (unchanged)
6. **PDF limit note** — if format is PDF and selected count > 200, show:
   "PDF export limited to 200 recipes" (was 50)
7. **Action buttons** — Cancel + Export (unchanged, Export disabled when 0
   selected)

**Widen the modal** from `max-w-md` to `max-w-lg` to accommodate the checklist
without feeling cramped.

**State changes:**
- Add `selectedIds: Set<string>` state, initialized to all filtered recipe IDs
- When filters change, reset `selectedIds` to include all recipes matching the
  new filter (all checked by default)
- "Select all" sets `selectedIds` to all currently filtered IDs
- "Deselect all" clears `selectedIds`
- Individual checkbox toggles add/remove from `selectedIds`
- Export uses `selectedIds` instead of `filtered.map(r => r.id)`
- For PDF: `Array.from(selectedIds).slice(0, 200)` (was 50)

### No other components change

---

## 5. Business Logic

1. **All recipes checked by default.** When the modal opens or filters change,
   every recipe matching the current filter is selected. Users deselect what
   they don't want.
2. **Selection follows filtering.** If a user selects 10 recipes, then narrows
   the tag filter so 3 of those disappear from the list, the export should only
   include recipes that are both selected AND currently visible. When the filter
   is cleared, previously selected recipes reappear as checked.
3. **Export button disabled when 0 selected.** The count "0 of Y selected"
   and a disabled Export button make it clear nothing will happen.
4. **PDF limit is 200.** Both client-side `.slice(0, 200)` and the Zod schema
   `.max(200)`. The informational message only shows when the selected count
   exceeds 200.
5. **JSON export has no limit.** All selected recipes are exported.

---

## 6. Test Cases

| # | Test case | File(s) affected |
|---|---|---|
| T01 | Modal renders a checklist with one row per filtered recipe | `BatchExportModal.tsx` |
| T02 | All recipes are checked by default | `BatchExportModal.tsx` |
| T03 | Unchecking a recipe removes it from the export count | `BatchExportModal.tsx` |
| T04 | "Select all" checks all filtered recipes | `BatchExportModal.tsx` |
| T05 | "Deselect all" unchecks all recipes | `BatchExportModal.tsx` |
| T06 | Export button is disabled when 0 recipes selected | `BatchExportModal.tsx` |
| T07 | PDF export uses selected IDs (not all filtered) | `BatchExportModal.tsx` |
| T08 | JSON export uses selected IDs (not all filtered) | `BatchExportModal.tsx` |
| T09 | PDF limit raised to 200 in Zod schema | `lib/schemas.ts` |
| T10 | Changing filters resets selection to all matching | `BatchExportModal.tsx` |
| T11 | PDF limit note shows only when selected > 200 | `BatchExportModal.tsx` |

---

## 7. Out of Scope

- Drag-to-reorder recipes in the export
- Saving export presets or remembered selections
- Changing the PDF generation logic or layout
- Bulk select from the main recipe list to pre-populate the export modal
- Pagination of the recipe checklist (scrolling is sufficient for 200+)

---

Awaiting owner approval before Writer proceeds.
