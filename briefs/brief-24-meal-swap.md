# Brief 24 — Meal Swap on Calendar

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/meal-swap`
**Target:** PR into `main`
**Depends on:** Briefs 01–07 merged to main

---

## User Story

As a Thymeline user, I want to swap two meals on my calendar — tap one meal,
tap another, and they trade dates — so I can reorganise my week without
replanning from scratch.

---

## Core Concept

A simple two-tap swap flow. The user taps a meal to "select" it (it highlights),
then taps another meal to swap with. The two meals trade dates instantly. No
drag and drop, no modal, no confirmation — just two taps and done.

A single undo action is available immediately after a swap in case of a mis-tap.

---

## UI Flow

### Entering swap mode

A "Swap meals" button appears in the calendar week header toolbar (alongside
any existing week-level actions). Tapping it enters swap mode.

In swap mode:
- A banner appears below the header: "Tap a meal to select it"
- A "Cancel" button appears in the header (exits swap mode, no changes)
- All meal cards get a subtle border to indicate they are tappable

### First tap — select a meal

- The tapped meal card highlights with a sage border and a small checkmark
  badge in the corner
- The banner updates: "Now tap a meal to swap with"
- The user can tap the same meal again to deselect it (back to "Tap a meal
  to select it")
- The user can tap "Cancel" to exit swap mode entirely

### Second tap — confirm the swap

- The two meals instantly trade dates in the DB
- Swap mode exits automatically
- A toast notification appears: "Meals swapped ✓" with an "Undo" action
- The calendar re-renders with the new positions

### Undo

- The "Undo" action in the toast reverses the swap (trades the dates back)
- The toast is visible for 5 seconds
- After 5 seconds the toast dismisses and undo is no longer available

### Edge cases

**Tapping an empty day slot:**
- Not allowed — empty slots are not tappable in swap mode
- If the user taps an empty slot, show a subtle shake animation on the slot

**Tapping the same meal twice (as both selections):**
- Not allowed — if the user taps the already-selected meal as the second tap,
  treat it as a deselect (back to first-tap state)

**Multi-meal days (multiple meal types on the same day):**
- Each meal card is individually tappable — the swap operates on individual
  meal entries, not whole days
- A breakfast on Tuesday can be swapped with a dinner on Thursday

**Swapping across weeks:**
- Not supported in v1 — swap mode only shows the current week view
- Out of scope note added below

---

## API Route

### `POST /api/plan/swap`

Swaps the dates of two meal plan entries.

**Auth:** Authenticated. User must own both entries (or be in the same
household).

**Input:**
```typescript
{
  entry_id_a: string   // meal_plan_entries primary key
  entry_id_b: string   // meal_plan_entries primary key
}
```

**Behavior:**
1. Fetch both entries, verify ownership
2. In a single transaction:
   - Set entry A's `planned_date` to entry B's original `planned_date`
   - Set entry B's `planned_date` to entry A's original `planned_date`
3. Return both updated entries

**Response:**
```typescript
{
  entry_a: { id: string, planned_date: string, recipe_id: string }
  entry_b: { id: string, planned_date: string, recipe_id: string }
}
```

**Errors:**
- `400` — same entry_id provided for both
- `403` — user does not own one or both entries
- `404` — one or both entries not found
- `500` — transaction failure

### `POST /api/plan/swap` (undo)

Undo is implemented by calling the same endpoint again with the same two
entry IDs — since it's a swap, calling it twice returns to the original state.
No separate undo endpoint needed.

---

## UI Components

### Updates to `app/(app)/plan/page.tsx` or `components/plan/WeekCalendarView.tsx`

- Add `isSwapMode: boolean` state
- Add `selectedEntryId: string | null` state
- Add "Swap meals" button to week header toolbar
- Add swap mode banner
- Pass swap mode state down to meal card components

### Updates to `components/plan/MealCard.tsx` (or equivalent)

- When `isSwapMode` is true:
  - Add tappable overlay/border to the card
  - When `selectedEntryId === this card's entry_id`: show sage border +
    checkmark badge
  - `onClick`: call `handleMealCardTap(entry_id)`

### `components/plan/SwapModeBanner.tsx` — new component

- Shows contextual instruction text ("Tap a meal to select it" /
  "Now tap a meal to swap with")
- Shows "Cancel" button

### `components/plan/SwapToast.tsx` — new component

- "Meals swapped ✓" with "Undo" action link
- Auto-dismisses after 5 seconds
- On "Undo" click: calls `POST /api/plan/swap` with the same two entry IDs,
  then dismisses

---

## Business Logic

1. **Swap is atomic** — both date updates happen in a single DB transaction.
   If either fails, neither is applied.

2. **Undo reuses the swap endpoint** — swapping the same two entries twice
   returns to the original state. No undo history needed server-side.

3. **Undo window is 5 seconds** — after the toast dismisses, undo is gone.
   The swap is permanent. This keeps the implementation simple.

4. **Swap mode is per-session** — entering/exiting swap mode is pure UI state.
   Navigating away exits swap mode automatically.

5. **Meal type is preserved** — when two entries swap dates, only `planned_date`
   changes. `meal_type` (breakfast, lunch, dinner) stays with the entry. A
   dinner entry swapped to a Monday is still a dinner on Monday.

6. **Household scope** — a user can swap any entry in their household's plan,
   not just their own entries. Ownership check is household-level.

7. **No swap across weeks in v1** — the swap UI is scoped to the currently
   visible week. Cross-week swaps require navigating to a week that shows both
   meals, which is a future enhancement.

8. **Empty slots are inert** — in swap mode, empty day slots show no visual
   affordance and tapping them does nothing (subtle shake animation only).

---

## Test Cases

| # | Test case |
|---|---|
| T01 | "Swap meals" button visible in week header |
| T02 | Tapping "Swap meals" enters swap mode |
| T03 | Swap mode banner shows "Tap a meal to select it" |
| T04 | Tapping a meal in swap mode selects it (sage border + checkmark) |
| T05 | Banner updates to "Now tap a meal to swap with" after selection |
| T06 | Tapping selected meal again deselects it |
| T07 | Tapping "Cancel" exits swap mode with no changes |
| T08 | Tapping a second meal calls POST /api/plan/swap |
| T09 | POST /api/plan/swap swaps planned_date of both entries |
| T10 | POST /api/plan/swap is atomic (both update or neither) |
| T11 | POST /api/plan/swap returns 403 for non-owner |
| T12 | POST /api/plan/swap returns 400 for same entry_id twice |
| T13 | Calendar re-renders with new meal positions after swap |
| T14 | "Meals swapped ✓" toast appears after swap |
| T15 | Toast "Undo" calls POST /api/plan/swap with same entry IDs |
| T16 | Undo restores original meal positions |
| T17 | Toast dismisses after 5 seconds |
| T18 | Tapping empty slot in swap mode shows shake animation |
| T19 | meal_type preserved after swap (dinner stays dinner) |
| T20 | Household member can swap another member's entries |

---

## Out of Scope

- Drag and drop
- Swapping meals across different weeks
- Swapping a meal with an empty slot (move without swap)
- Bulk rescheduling (move all meals forward one day)
- Undo history beyond the immediate last swap
- Swap suggestions ("these two meals would pair better if swapped")
