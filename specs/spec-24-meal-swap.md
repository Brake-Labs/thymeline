# Spec 24 — Meal Swap on Calendar

**Brief:** `briefs/brief-24-meal-swap.md`
**Branch:** `feature/meal-swap` (from `staging`)

---

## 1. Summary

Adds a two-tap swap flow to the weekly calendar view. The user enters swap mode, taps one meal to select it, then taps a second meal to swap their `planned_date` values atomically in the DB. An undo toast appears for 5 seconds after every swap, reusing the same endpoint.

---

## 2. DB Changes

### Migration `028_swap_entries_fn.sql`

Create a Postgres function that swaps the `planned_date` of two `meal_plan_entries` rows in a single transaction:

```sql
CREATE OR REPLACE FUNCTION swap_meal_plan_entries(entry_id_a uuid, entry_id_b uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  date_a date;
  date_b date;
BEGIN
  SELECT planned_date INTO date_a FROM meal_plan_entries WHERE id = entry_id_a FOR UPDATE;
  SELECT planned_date INTO date_b FROM meal_plan_entries WHERE id = entry_id_b FOR UPDATE;

  UPDATE meal_plan_entries SET planned_date = date_b WHERE id = entry_id_a;
  UPDATE meal_plan_entries SET planned_date = date_a WHERE id = entry_id_b;
END;
$$;
```

No new tables or columns. The `meal_plan_entries` table already has `id`, `planned_date`, `meal_type`, and `meal_plan_id`.

---

## 3. API Routes

### `POST /api/plan/swap` — new file: `app/api/plan/swap/route.ts`

**Auth:** `withAuth()` — required.

**New Zod schema** in `lib/schemas.ts` (name: `swapEntriesSchema` — distinct from the existing `swapSchema` which is for AI suggestion swaps):

```typescript
export const swapEntriesSchema = z.object({
  entry_id_a: z.string().uuid(),
  entry_id_b: z.string().uuid(),
})
```

**Route logic:**

1. `parseBody(req, swapEntriesSchema)` — return `error` if invalid.
2. Return `400` if `entry_id_a === entry_id_b`.
3. Fetch both entries in parallel via admin `db` client:
   ```typescript
   db.from('meal_plan_entries')
     .select('id, planned_date, recipe_id, meal_plan_id, meal_plans(user_id, household_id)')
     .eq('id', entry_id_a)
     .maybeSingle()
   ```
   Fetch entry B with the same shape.
4. Return `404` if either entry is null.
5. Ownership check using `ctx`:
   - With household context: both `meal_plans.household_id` must equal `ctx.householdId`
   - Without: both `meal_plans.user_id` must equal `user.id`
   - Return `403` if either fails.
6. Execute the atomic swap via Supabase RPC:
   ```typescript
   const { error: rpcError } = await db.rpc('swap_meal_plan_entries', {
     entry_id_a,
     entry_id_b,
   })
   ```
   Return `500` if `rpcError` is set.
7. Return updated entries:
   ```typescript
   {
     entry_a: { id: string, planned_date: string, recipe_id: string },
     entry_b: { id: string, planned_date: string, recipe_id: string },
   }
   ```
   Re-fetch both rows after the RPC call to get the updated `planned_date` values.

**Response shape:**
```typescript
{
  entry_a: { id: string, planned_date: string, recipe_id: string }
  entry_b: { id: string, planned_date: string, recipe_id: string }
}
```

**Error responses:**
| Status | Condition |
|--------|-----------|
| 400 | `entry_id_a === entry_id_b` |
| 403 | User does not own one or both entries |
| 404 | One or both entries not found |
| 500 | RPC transaction failure |

---

## 4. UI Components

### 4a. Refactor `app/(app)/plan/[week_start]/page.tsx`

The page is a server component. Changes required:
- Update the entries select query to include `id` and `meal_type`:
  ```typescript
  .select('id, planned_date, recipe_id, position, confirmed, meal_type, recipes(title)')
  ```
- Pass the enriched entries array (now including `id` and `meal_type`) as props to a new client component `WeekCalendarView`.
- The page retains server-only logic (auth check, data fetching, week nav). The week nav links can stay inline or be passed as props — keep it simple.

### 4b. New: `components/plan/WeekCalendarView.tsx` — client component

Owns all swap interaction state. Props:

```typescript
interface WeekCalendarViewEntry {
  id: string
  planned_date: string
  recipe_title: string
  meal_type: string
  confirmed: boolean
}

interface WeekCalendarViewProps {
  entries: WeekCalendarViewEntry[]
  weekStart: string
}
```

State:
```typescript
const [isSwapMode, setIsSwapMode] = useState(false)
const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
const [localEntries, setLocalEntries] = useState(entries)
const [swapToast, setSwapToast] = useState<{ entryIdA: string; entryIdB: string } | null>(null)
```

`localEntries` is the optimistically updated list. Initialised from `entries` prop; updated on successful swap without a full page reload.

`handleMealCardTap(entryId: string)`:
- If `!isSwapMode`: no-op
- If `selectedEntryId === null`: set `selectedEntryId = entryId`
- If `selectedEntryId === entryId`: set `selectedEntryId = null` (deselect)
- If `selectedEntryId !== null && selectedEntryId !== entryId`: call `performSwap(selectedEntryId, entryId)`

`performSwap(idA, idB)`:
1. Exit swap mode: `setIsSwapMode(false)`, `setSelectedEntryId(null)`
2. Optimistically update `localEntries` — swap the `planned_date` of the two entries
3. Call `POST /api/plan/swap` with `{ entry_id_a: idA, entry_id_b: idB }`
4. On success: set `swapToast({ entryIdA: idA, entryIdB: idB })`
5. On failure: revert `localEntries` to pre-swap state, show a brief error message (simple inline text, no new component needed)

Layout:
- Render `isSwapMode` toolbar: "Swap meals" button (when not in swap mode) in the header actions area
- Render `<SwapModeBanner>` when `isSwapMode` is true
- Render each entry as a `<MealCard>` (see 4c)
- Render `<SwapToast>` when `swapToast` is non-null

### 4c. New: `components/plan/MealCard.tsx`

Extracted from the inline `<div>` rendering in the current page. Props:

```typescript
interface MealCardProps {
  id: string
  planned_date: string
  recipe_title: string
  meal_type: string
  confirmed: boolean
  isSwapMode: boolean
  isSelected: boolean
  onTap: (entryId: string) => void
}
```

Rendering:
- Base: same layout as current inline card (date label, recipe title, confirmed badge)
- When `isSwapMode`:
  - Add `cursor-pointer` and a subtle `ring-1 ring-stone-300` border to indicate tappability
  - Call `onTap(id)` on click
- When `isSelected` (i.e. `isSwapMode && isSelected`):
  - Replace ring with `ring-2 ring-sage-500`
  - Show a small checkmark badge (`✓`) in the top-right corner

Empty day slot shake: empty slots are not rendered as `MealCard`. When the user taps an empty slot in swap mode, show a CSS `animate-shake` pulse. The Writer should add a `keyframes` definition in `tailwind.config.ts` for `shake` (3-frame horizontal translate, ~300ms). This only fires if the Writer decides to render empty slots; the brief allows omitting them entirely since empty slots are "not tappable."

### 4d. New: `components/plan/SwapModeBanner.tsx`

Props:
```typescript
interface SwapModeBannerProps {
  hasSelection: boolean   // true after first tap
  onCancel: () => void
}
```

Renders:
- A banner row below the week header
- Text: `"Tap a meal to select it"` (when `!hasSelection`) or `"Now tap a meal to swap with"` (when `hasSelection`)
- A "Cancel" button that calls `onCancel` — which sets `isSwapMode = false`, `selectedEntryId = null`

Styling: `bg-sage-50 border border-sage-200 rounded-lg px-4 py-2 text-sm text-sage-800` — consistent with Thymeline's sage palette.

### 4e. New: `components/plan/SwapToast.tsx`

Props:
```typescript
interface SwapToastProps {
  entryIdA: string
  entryIdB: string
  onUndo: (idA: string, idB: string) => void
  onDismiss: () => void
}
```

Behaviour:
- On mount, starts a 5-second `setTimeout` that calls `onDismiss`
- "Undo" button calls `onUndo(entryIdA, entryIdB)` then `onDismiss`
- `onUndo` in the parent calls `performSwap(idA, idB)` again (same endpoint, same IDs — reverses the swap)

Styling: fixed bottom toast, `bg-stone-800 text-white rounded-lg px-4 py-3 flex items-center gap-4 text-sm`. "Undo" is an underline link styled in `text-sage-300`.

---

## 5. Business Logic

1. **Atomic swap via Postgres RPC.** Both `planned_date` updates happen inside a single `plpgsql` transaction. If either update fails, the DB rolls back. The API returns `500` and the client reverts the optimistic update.

2. **Undo is a second swap.** Calling `POST /api/plan/swap` with the same two entry IDs a second time returns to the original state. No server-side undo history.

3. **Undo window is 5 seconds only.** After `SwapToast` auto-dismisses, undo is unavailable. No persistent undo state.

4. **`meal_type` is never changed.** Only `planned_date` is swapped. A dinner entry swapped to Monday is still `meal_type = 'dinner'`.

5. **Household scope.** The ownership check uses `ctx.householdId` when present; falls back to `user.id`. Either member of a household can swap any entry in the shared plan.

6. **Optimistic update.** `WeekCalendarView` swaps the `planned_date` values in `localEntries` immediately on second tap, before the API responds. On API failure, it reverts to the prior state.

7. **Swap mode is ephemeral UI state.** Navigating away (Next.js route change) discards swap mode. No persistence needed.

8. **Empty slots have no swap affordance.** If empty slots are rendered at all, they must not be wrapped in `MealCard` and must not call `onTap`.

---

## 6. Test Cases

All tests go in `app/api/plan/__tests__/plan-api.test.ts` (API) and a new `components/plan/__tests__/WeekCalendarView.test.tsx` (UI) or inline in the relevant test files.

### API tests — `POST /api/plan/swap`

| ID | Scenario | Expected |
|----|----------|----------|
| T09 | Valid swap: two entries with different `planned_date` | Both entries return with swapped dates; 200 |
| T10 | RPC mock confirms both updates fire in one call | Single `db.rpc` call with both IDs |
| T11 | entry_id_a owned by different user (no household) | 403 |
| T12 | entry_id_a === entry_id_b | 400 |
| T11b | entry_id_b not found | 404 |
| T10b | RPC returns error | 500 |
| T20 | Household member swaps another member's entry | 200 (household ownership passes) |
| T19 | `meal_type` column not modified by swap | entry_a.meal_type unchanged in response |

### UI tests — `WeekCalendarView`

| ID | Scenario | Expected |
|----|----------|----------|
| T01 | "Swap meals" button visible | rendered in DOM |
| T02 | Click "Swap meals" → swap mode on | `SwapModeBanner` appears |
| T03 | Banner shows "Tap a meal to select it" before selection | text present |
| T04 | Tap first meal card → card shows sage ring + checkmark | selection classes applied |
| T05 | Banner updates to "Now tap a meal to swap with" | text present |
| T06 | Tap selected card again → deselected | sage ring removed, banner reverts |
| T07 | Click "Cancel" in banner → swap mode off, no API call | `isSwapMode` false, no fetch |
| T08 | Tap second different card → `POST /api/plan/swap` called | fetch mock called with correct IDs |
| T13 | After successful swap, `localEntries` reflect swapped dates | rendered date labels swapped |
| T14 | `SwapToast` appears after swap | toast text "Meals swapped ✓" visible |
| T15 | Toast "Undo" button → `POST /api/plan/swap` called with same IDs | fetch mock called again |
| T16 | After undo, `localEntries` revert to original dates | date labels back to original |
| T17 | Toast auto-dismisses after 5 s (use `vi.useFakeTimers`) | toast not in DOM after 5000 ms |
| T18 | Tap empty slot in swap mode → no state change | no selection, no API call |

---

## 7. Out of Scope

- Drag and drop
- Cross-week swaps (swap mode is scoped to the currently visible week)
- Moving a meal to an empty slot (swap requires two existing meals)
- Bulk rescheduling
- Undo history beyond the immediate last swap
- AI-powered swap suggestions ("these two meals would pair better if swapped")

---

Awaiting owner approval before Writer proceeds.
