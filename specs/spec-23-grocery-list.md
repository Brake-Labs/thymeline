# Spec 23 — Grocery List Generation

**Brief:** `briefs/brief-23-grocery-list.md`
**Branch:** `feature/grocery-list` (cut from `main`)
**Depends on:** Briefs 01–07 merged to main
**Status:** Approved — Writer may proceed

---

## 1. Summary

Generate a consolidated grocery list from a user-selected date range of planned
meals. Ingredients are deduplicated and combined across recipes; items are
classified as fresh/specialty ("need to buy") or pantry staples.

**The majority of this feature is already implemented.** This spec documents the
existing system and describes the four remaining gaps the Writer must close.

---

## 2. No migrations needed

`grocery_lists` already exists (migrations 009, 014). All new behaviour is API
and UI logic only.

---

## 3. What is already built — do not rewrite

The Writer must NOT re-implement or modify the following unless explicitly
instructed in §4.

| File | What it does |
|---|---|
| `app/(app)/groceries/page.tsx` | Page shell |
| `components/groceries/GroceriesPageClient.tsx` | Date range picker (DateInput + presets) + fetch/generate flow |
| `components/groceries/GroceryListView.tsx` | Full list view: recipe sections, servings scaling, regenerate, share |
| `components/groceries/RecipeSectionGroup.tsx` | Per-recipe ingredient section with servings stepper |
| `components/groceries/GroceryItemRow.tsx` | Checkbox row, "Got it" button, remove button |
| `components/groceries/GotItSection.tsx` | Collapsed "Got it" tray |
| `components/groceries/AddItemInput.tsx` | Add custom item |
| `components/groceries/GenerateGroceriesButton.tsx` | Standalone generate button (used externally) |
| `app/api/groceries/route.ts` | `GET /api/groceries` (fetch list) + `PATCH /api/groceries` (persist) |
| `app/api/groceries/generate/route.ts` | `POST /api/groceries/generate` (generate + upsert) |
| `lib/grocery.ts` | `parseIngredientLine`, `combineIngredients`, `assignSection`, `isPantryStaple`, `buildPlainTextList`, `effectiveServings`, `scaleItem` |
| `lib/grocery-scrape.ts` | `resolveRecipeIngredients` (vault-first, Firecrawl fallback) |
| `components/layout/AppNav.tsx` | `/groceries` already in nav (desktop + mobile) |

---

## 4. Files changed — complete list for this spec

| File | Change |
|---|---|
| `app/api/groceries/count/route.ts` | New — recipe count endpoint |
| `lib/schemas.ts` | Add `groceriesCountSchema` |
| `components/calendar/WeekCalendar.tsx` | Add "Grocery list" button (entry point) |
| `components/groceries/GroceriesPageClient.tsx` | Fetch recipe count, show hint, disable generate when 0 |
| `components/groceries/GroceryItemRow.tsx` | Pantry inverted semantics + inline editing |
| `lib/grocery.ts` | Update `buildPlainTextList` export logic for pantry items |
| `components/groceries/GroceryListView.tsx` | Add `handleEdit`, wire new `onEdit` prop, update export call |

---

## 5. Gap 1 — Calendar entry point

**Brief requirement:** "Grocery List button on the meal plan calendar view —
visible when at least one recipe is planned in the current week."

**File:** `components/calendar/WeekCalendar.tsx`

Add a "Grocery list" button in the top-bar next to the week navigation arrow
buttons. Only render it when `entries.length > 0`. Clicking navigates to
`/groceries?date_from=<weekStart>&date_to=<addDays(weekStart, 6)>`.

```tsx
import { ShoppingCart } from 'lucide-react'
import Link from 'next/link'

{entries.length > 0 && (
  <Link
    href={`/groceries?date_from=${weekStart}&date_to=${addDays(weekStart, 6)}`}
    className="flex items-center gap-1.5 text-sm font-medium text-sage-600 hover:text-sage-800 transition-colors"
  >
    <ShoppingCart size={14} />
    Grocery list
  </Link>
)}
```

Place this link in the existing flex row that contains the prev/next week
buttons — after the "Next" button, right-aligned.

**No changes to any other calendar component.**

---

## 6. Gap 2 — Recipe count hint and disabled generate

**Brief requirement (T02):** "Generate list disabled until at least one recipe
exists in the selected range; shows a count: X recipes in this range."

### 6a. New endpoint: `GET /api/groceries/count`

**File:** `app/api/groceries/count/route.ts`

```typescript
// GET /api/groceries/count?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
// Returns: { recipe_count: number }
```

**Behavior:**
1. Parse `date_from` and `date_to` query params; return 400 if either is missing
2. Fetch all meal plan IDs scoped to the user/household:
   ```typescript
   let plansQ = db.from('meal_plans').select('id')
   plansQ = scopeQuery(plansQ, user.id, ctx)
   const { data: plans } = await plansQ
   ```
3. Query `meal_plan_entries` in range:
   ```typescript
   const { data: entries } = await db
     .from('meal_plan_entries')
     .select('recipe_id')
     .in('meal_plan_id', planIds)
     .gte('planned_date', date_from)
     .lte('planned_date', date_to)
   ```
4. Count distinct recipe_ids:
   ```typescript
   const recipe_count = new Set((entries ?? []).map((e) => e.recipe_id)).size
   return NextResponse.json({ recipe_count })
   ```
5. If no plans found: return `{ recipe_count: 0 }` (not an error)

**Schema (`lib/schemas.ts`)** — add after existing grocery schemas:
```typescript
export const groceriesCountSchema = z.object({
  date_from: dateString,
  date_to:   dateString,
})
```

Use `parseBody` is not applicable for GET params; validate inline:
```typescript
const url = new URL(req.url)
const date_from = url.searchParams.get('date_from')
const date_to   = url.searchParams.get('date_to')
if (!date_from || !date_to) {
  return NextResponse.json({ error: 'date_from and date_to are required' }, { status: 400 })
}
```

### 6b. Changes to `GroceriesPageClient.tsx`

1. Add state: `const [recipeCount, setRecipeCount] = useState<number | null>(null)`

2. When `dateFrom` or `dateTo` changes, fetch the count in parallel with the
   existing `fetchList` call:
   ```typescript
   async function fetchCount(from: string, to: string) {
     try {
       const token = await getAccessToken()
       const res = await fetch(`/api/groceries/count?date_from=${from}&date_to=${to}`, {
         headers: { Authorization: `Bearer ${token}` },
       })
       if (res.ok) {
         const json = await res.json()
         setRecipeCount(json.recipe_count ?? 0)
       }
     } catch { /* ignore */ }
   }
   ```
   Call `fetchCount` alongside `fetchList` in the `useEffect`.

3. Show the count hint below the date range picker, above the generate button:
   ```tsx
   {recipeCount !== null && (
     <p className="text-sm text-stone-500">
       {recipeCount === 0
         ? 'No recipes planned for this period'
         : `${recipeCount} recipe${recipeCount === 1 ? '' : 's'} in this range`
       }
     </p>
   )}
   ```

4. Disable the "Generate grocery list" button when `recipeCount === 0`:
   ```tsx
   <button
     ...
     disabled={generating || recipeCount === 0}
     ...
   >
   ```

---

## 7. Gap 3 — Pantry staple inverted semantics

**Brief requirement (T12, T14, T16):**
- Checking a pantry staple item marks it as "I need this too" → include in export
- Unchecked pantry items are assumed to be already stocked → exclude from export
- Export = (non-pantry items not marked "Got it") + (pantry items that are checked)

**Background on existing `checked` vs `bought`:**
- `checked: boolean` — checkbox state (currently: strikethrough for all items)
- `bought: boolean | undefined` — "Got it" state (moves item to Got it tray,
  excluded from `buildPlainTextList` export)
- Currently: `buildPlainTextList` filters by `!i.bought` (excludes "Got it" items)

**The change:** For `is_pantry: true` items, `checked` means "add to export"
(not strikethrough). `bought` semantics are unchanged for non-pantry items.

### 7a. `GroceryItemRow.tsx`

Change the visual and interactive behaviour for pantry items:

```tsx
// Pantry items:
// - unchecked: muted text with "(in pantry)" label  
// - checked: sage tint text, no strikethrough — means "also buy this"
// Non-pantry items:
// - unchecked: normal text
// - checked (via checkbox toggle): strikethrough — means "I have this, don't export"
//   (Got it button continues to set bought: true, move to tray)

const textClass = item.is_pantry
  ? item.checked
    ? 'text-sage-700 font-medium'     // "add to cart"
    : 'text-stone-400'                // "assume you have it"
  : item.checked
    ? 'line-through text-stone-400'   // "I have this"
    : 'text-stone-800'

// Replace existing "(optional)" label with "(in pantry)" and only show when !checked
{item.is_pantry && !item.checked && (
  <span className="ml-1 text-xs text-stone-400">(in pantry)</span>
)}

// For pantry items, hide "Got it" button — it is semantically confusing
// (pantry items have inverted semantics; "Got it" is for non-pantry use)
{onGotIt && !item.is_pantry && (
  <button ... >{/* Got it */}</button>
)}
```

The checkbox visual for pantry checked items should use a sage ring instead of
a filled checkbox to distinguish the "add to cart" state:

```tsx
<button
  ...
  className={[
    'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
    item.is_pantry
      ? item.checked
        ? 'border-sage-500 bg-sage-50'       // pantry "add to cart"
        : 'border-stone-200'                 // pantry "have it"
      : item.checked
        ? 'bg-stone-200 border-stone-200'   // non-pantry "have it"
        : 'border-stone-300 hover:border-stone-400'
  ].join(' ')}
>
  {item.is_pantry && item.checked && (
    <span className="w-2 h-2 rounded-sm bg-sage-500" />
  )}
  {!item.is_pantry && item.checked && (
    <svg className="w-3 h-3 text-stone-500" viewBox="0 0 12 10" fill="none">
      <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )}
</button>
```

### 7b. `lib/grocery.ts` — update `buildPlainTextList`

Replace the export filter in `buildPlainTextList`:

```typescript
// Before:
const filtered = options?.onlyUnchecked ? items.filter((i) => !i.bought) : items

// After:
const filtered = options?.onlyUnchecked
  ? items.filter((i) => i.is_pantry ? i.checked : !i.bought)
  : items
```

This ensures:
- Non-pantry items: exported unless "Got it" (`bought: true`)
- Pantry items: exported only when explicitly checked ("I need this")

### 7c. `GroceryListView.tsx` — no logic change needed

The existing `handleShare` already calls `buildPlainTextList` with `onlyUnchecked: true`.
No change to the call site — the updated `buildPlainTextList` handles the new logic.

---

## 8. Gap 4 — Inline item editing

**Brief requirement (T17):** "Tap any item to edit quantity or name inline."

### 8a. `GroceryItemRow.tsx`

Add an edit mode toggle. When the user clicks the item label text (not the
checkbox), show inline inputs for editing.

Add prop:
```typescript
interface GroceryItemRowProps {
  // ... existing props ...
  onEdit?: (itemId: string, updates: { name: string; amount: number | null; unit: string | null }) => void
}
```

Add local state:
```typescript
const [editing, setEditing] = useState(false)
const [editName,   setEditName  ] = useState(item.name)
const [editAmount, setEditAmount] = useState(item.amount !== null ? String(item.amount) : '')
const [editUnit,   setEditUnit  ] = useState(item.unit ?? '')
```

When not editing, clicking the label text activates edit mode:
```tsx
<button
  type="button"
  onClick={() => { if (onEdit) setEditing(true) }}
  className={`flex-1 text-left text-sm ${textClass}`}
>
  {label}
  {/* existing pantry label */}
</button>
```

When editing:
```tsx
{editing && (
  <div className="flex-1 flex items-center gap-1">
    <input
      autoFocus
      type="text"
      value={editAmount}
      onChange={(e) => setEditAmount(e.target.value)}
      placeholder="qty"
      className="w-14 text-sm border border-stone-300 rounded px-1 py-0.5"
    />
    <input
      type="text"
      value={editUnit}
      onChange={(e) => setEditUnit(e.target.value)}
      placeholder="unit"
      className="w-14 text-sm border border-stone-300 rounded px-1 py-0.5"
    />
    <input
      type="text"
      value={editName}
      onChange={(e) => setEditName(e.target.value)}
      className="flex-1 text-sm border border-stone-300 rounded px-1 py-0.5"
    />
    <button
      type="button"
      onClick={handleSaveEdit}
      className="text-xs text-sage-600 hover:text-sage-800 font-medium px-1"
    >
      Save
    </button>
    <button
      type="button"
      onClick={() => setEditing(false)}
      className="text-xs text-stone-400 hover:text-stone-600 px-1"
    >
      ✕
    </button>
  </div>
)}
```

Save handler:
```typescript
function handleSaveEdit() {
  if (!onEdit || !editName.trim()) return
  const parsedAmount = editAmount.trim() ? parseFloat(editAmount) : null
  onEdit(item.id, {
    name:   editName.trim(),
    amount: parsedAmount !== null && !isNaN(parsedAmount) ? parsedAmount : null,
    unit:   editUnit.trim() || null,
  })
  setEditing(false)
}
```

Also save on Enter key in any input field (add `onKeyDown` handler checking
`e.key === 'Enter'`).

### 8b. `GroceryListView.tsx`

Add `handleEdit` callback and wire it to all `GroceryItemRow` usages:

```typescript
const handleEdit = useCallback(async (
  itemId: string,
  updates: { name: string; amount: number | null; unit: string | null }
) => {
  const updated = items.map((i) =>
    i.id === itemId ? { ...i, ...updates } : i
  )
  setItems(updated)
  await patch({ items: updated })
}, [items, weekStart]) // eslint-disable-line react-hooks/exhaustive-deps
```

Pass `onEdit={handleEdit}` to all `GroceryItemRow` components rendered in:
- The recipe sections (within `RecipeSectionGroup` — pass through as prop)
- The "Other items" section (user-added items with `recipes.length === 0`)
- `GotItSection` (items moved to the "Got it" tray)

**`RecipeSectionGroup.tsx`** — add `onEdit` to props interface and pass through
to each `GroceryItemRow`:
```typescript
interface RecipeSectionGroupProps {
  // ... existing props ...
  onEdit: (itemId: string, updates: { name: string; amount: number | null; unit: string | null }) => void
}
```

---

## 9. Business logic rules

1. **Pantry inverted semantics are opt-in by checking** — `is_pantry` items
   appear in each recipe section alongside non-pantry items. The visual
   distinction (muted text, "(in pantry)" label) signals the inverted
   behaviour. Unchecked pantry items are never in the export.

2. **Export formula**: `item.is_pantry ? item.checked : !item.bought`
   — non-pantry exports unless "Got it"; pantry exports only when checked.

3. **Inline edits persist to DB** — `handleEdit` calls `patch({ items })` so
   edits survive page refresh. This is the right behaviour given the existing
   persistence architecture; the brief's "client-only" note was written before
   DB persistence was designed.

4. **Calendar button visibility** — only shown when `entries.length > 0` for
   the currently-displayed week. Uses `addDays(weekStart, 6)` for `date_to`
   (Sunday to Saturday).

5. **Recipe count endpoint returns 0, not an error, when no plans exist** —
   this correctly disables the generate button rather than showing an error.

6. **`scopeQuery` two-step pattern** in the count endpoint — same as all other
   routes:
   ```typescript
   let plansQ = db.from('meal_plans').select('id')
   plansQ = scopeQuery(plansQ, user.id, ctx)
   ```

7. **`generateGroceriesSchema` in `lib/schemas.ts`** already validates
   `date_from` / `date_to`. The count endpoint validates inline (GET params,
   not a body). Do not add `groceriesCountSchema` to `parseBody` — it is only
   used for reference.

---

## 10. Test cases

The following test IDs map to the brief. Test IDs already covered by the
existing test suite are noted; the Writer only needs to add tests for the
gaps (starred ★).

| # | Test case | Status |
|---|---|---|
| T01 | Date range picker defaults to current week | ✅ `GroceriesPageClient` existing |
| T02 ★ | Generate disabled when no recipes in range | New — needs test |
| T03 | POST /api/groceries/generate returns consolidated items | ✅ T04 in existing test file |
| T04 | Same-ingredient items consolidated | ✅ T08 in existing test file |
| T05 | Same-unit quantities summed | ✅ T08 in existing test file |
| T06 | Incompatible units listed separately | ✅ covered by `combineIngredients` test |
| T07 | Each item has recipe attribution | ✅ T07 in existing test file |
| T08 | Items classified as need_to_buy / pantry_staple | ✅ `is_pantry` via T09 in existing test file |
| T09 | need_to_buy items default unchecked | ✅ items initialized `checked: false` |
| T10 | pantry_staple items default unchecked | ✅ items initialized `checked: false` |
| T11 | Checking need_to_buy item moves to "Already have" | ✅ "Got it" / `bought: true` in existing |
| T12 ★ | Checking pantry_staple adds sage tint, includes in export | New — needs test |
| T13 | Unchecking restores item | ✅ existing |
| T14 ★ | Export = unchecked need_to_buy + checked pantry_staple | New — needs test (update `buildPlainTextList` test) |
| T15 | Export excludes checked need_to_buy (Got it) | ✅ `buildPlainTextList` with `onlyUnchecked` |
| T16 ★ | Export excludes unchecked pantry_staple | New — update `buildPlainTextList` test |
| T17 ★ | Inline quantity edit reflected in export | New — component unit test |
| T18 | Custom add item in list and export | ✅ `AddItemInput` existing |
| T19 | `buildPlainTextList` produces correct plain text | ✅ existing (update for new logic) |
| T20 | `shareViaOS` calls `navigator.share()` on mobile | ✅ existing |
| T21 | `shareViaOS` falls back to clipboard on desktop | ✅ existing |
| T22 | LLM failure falls back to raw deduplication | ✅ T06 in existing test file |
| T23 | Regenerate resets checkbox state | ✅ existing |
| T24 | Empty date range shows empty state | ✅ existing |
| T25 | Household: all members' recipes included | ✅ T25 in existing test file |

### New tests the Writer must add

**T02 — count endpoint and disabled state:**
```typescript
describe('T02 - Generate button disabled when no recipes in range', () => {
  it('GET /api/groceries/count returns 0 when no meal plans exist', async () => {
    // mock db: plans returns []
    // expect { recipe_count: 0 }
  })
  it('GET /api/groceries/count returns correct count with entries', async () => {
    // mock db: 2 distinct recipe_ids in range
    // expect { recipe_count: 2 }
  })
})
```

**T12, T14, T16 — pantry export logic (`lib/grocery.ts`):**
```typescript
describe('T12 / T14 / T16 - Pantry staple export semantics', () => {
  it('T12 - pantry item checked → included in export', () => {
    const items: GroceryItem[] = [
      { id: '1', name: 'olive oil', amount: 2, unit: 'tbsp',
        section: 'Pantry', is_pantry: true, checked: true, bought: false, recipes: ['Pasta'] },
    ]
    const result = buildPlainTextList(items, [], 4, '2026-03-15', { onlyUnchecked: true })
    expect(result).toContain('olive oil')
  })
  it('T16 - pantry item unchecked → excluded from export', () => {
    const items: GroceryItem[] = [
      { id: '1', name: 'olive oil', amount: 2, unit: 'tbsp',
        section: 'Pantry', is_pantry: true, checked: false, bought: false, recipes: ['Pasta'] },
    ]
    const result = buildPlainTextList(items, [], 4, '2026-03-15', { onlyUnchecked: true })
    expect(result).toBe('')
  })
  it('T14 - export = unchecked need_to_buy + checked pantry_staple', () => {
    const items: GroceryItem[] = [
      { id: '1', name: 'chicken', amount: 1, unit: 'lb',
        section: 'Proteins', is_pantry: false, checked: false, bought: false, recipes: ['Pasta'] },
      { id: '2', name: 'flour', amount: 1, unit: 'cup',
        section: 'Pantry', is_pantry: true, checked: true, bought: false, recipes: ['Pasta'] },
      { id: '3', name: 'cream', amount: null, unit: null,
        section: 'Dairy & Eggs', is_pantry: false, checked: false, bought: true, recipes: ['Pasta'] },
    ]
    const result = buildPlainTextList(items, [], 4, '2026-03-15', { onlyUnchecked: true })
    expect(result).toContain('chicken')  // non-pantry, not bought
    expect(result).toContain('flour')    // pantry, checked
    expect(result).not.toContain('cream') // non-pantry, bought
  })
})
```

**T17 — inline edit:**
```typescript
describe('T17 - Inline quantity edit reflected in export', () => {
  it('handleEdit updates item and patches to API', () => {
    // render GroceryListView with one item
    // trigger handleEdit('item-1', { name: 'pasta', amount: 300, unit: 'g' })
    // verify item quantity updated in state
    // verify patch called with updated items
  })
})
```

---

## 11. Out of scope

Per the brief and pre-existing implementation decisions:

- Persisting checkbox state across sessions — already persisted via DB (richer than brief specified)
- Syncing with Apple Reminders or Google Tasks via OAuth
- Aisle grouping — existing `GrocerySection` type (Produce, Proteins, etc.) handles this in the recipe-organized view; no separate aisle UI needed
- Price estimation
- Barcode scanning
- Pantry auto-check integration — already partially implemented in `generate/route.ts` via `pantry_items` cross-reference
- Multiple saved grocery lists
- In-app sharing with household members

---

Awaiting owner approval before Writer proceeds.
