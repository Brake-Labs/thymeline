# Spec 12 — Pantry Tracker

**Brief:** `briefs/brief-12-pantry.md`
**Branch:** `feature/pantry` from `staging`
**Status:** Awaiting owner approval before Writer proceeds.

---

## 1. Summary

This feature adds a persistent pantry inventory to Forkcast. Users can track ingredients they have at home, optionally with quantity and expiry date. The pantry integrates into three existing flows: the grocery list ("Already have" flagging and one-click import), Help Me Plan (LLM context), and the recipe log endpoint (silent deduction of used ingredients). A new "What can I make?" LLM tool on the pantry screen ranks recipes by pantry ingredient overlap. A camera/file-picker scan flow uses Claude's vision API to detect ingredients from a photo.

---

## 2. DB Changes

### Migration: `supabase/migrations/014_pantry.sql`

> The next sequential migration number is `014`. (013 adds the Dessert meal type on the current hotfix branch.)

```sql
create table pantry_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  quantity     text,           -- freeform: "2 cans", "1 lb", "half a bag"
  section      text,           -- same sections as GrocerySection
  expiry_date  date,
  added_at     timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table pantry_items enable row level security;

create policy "owner full access"
  on pantry_items for all
  using (auth.uid() = user_id);

create index pantry_items_user_id_idx on pantry_items (user_id);
```

No changes to existing tables.

---

## 3. TypeScript Types (`types/index.ts`)

Add the following interface (append after `GroceryList`):

```typescript
export interface PantryItem {
  id:          string
  user_id:     string
  name:        string
  quantity:    string | null
  section:     string | null   // GrocerySection value or null
  expiry_date: string | null   // "YYYY-MM-DD"
  added_at:    string
  updated_at:  string
}
```

Add a type alias for pantry-match results (used by `POST /api/pantry/match`):

```typescript
export interface PantryMatch {
  recipe_id:     string
  recipe_title:  string
  match_count:   number
  matched_items: string[]
}
```

---

## 4. API Routes

### 4a. `GET /api/pantry`

Returns all pantry items for the authenticated user, ordered by `section` (nulls last) then `name`.

**Response:**
```typescript
{ items: PantryItem[] }
```

---

### 4b. `POST /api/pantry`

Add a single pantry item. Parse free-text input when `name` contains an embedded quantity.

**Input:**
```typescript
{
  name:         string   // required; may be free text like "2 cans tomatoes"
  quantity?:    string
  section?:     string
  expiry_date?: string   // "YYYY-MM-DD"
}
```

**Free-text parsing rules (rule-based, no LLM):**
Apply these in order to the `name` field before inserting:

1. Strip leading amount + unit token using the same pattern as `parseIngredientLine` in `lib/grocery.ts`.
   — "2 cans diced tomatoes" → `quantity: "2 cans"`, `name: "diced tomatoes"`
   — "1 lb chicken breast" → `quantity: "1 lb"`, `name: "chicken breast"`
2. If a `quantity` was already provided in the request body, do **not** overwrite it with the parsed value.
3. Auto-assign `section` via `assignSection(name)` from `lib/grocery.ts` unless the caller supplied one.
4. If parsing yields an empty name (e.g. the entire string was a number), store the original full string as `name` with no quantity.

**Response:** `{ item: PantryItem }` — 201

---

### 4c. `PATCH /api/pantry/[id]`

Update `quantity` and/or `expiry_date` of a single item. Verifies ownership via RLS.

**Input:**
```typescript
{
  quantity?:    string | null
  expiry_date?: string | null  // "YYYY-MM-DD" or null to clear
}
```

Returns `{ item: PantryItem }`. Returns 404 if the item doesn't exist for this user.

---

### 4d. `DELETE /api/pantry/[id]`

Delete a single item. Returns 204 on success. Returns 404 if not found for this user.

---

### 4e. `DELETE /api/pantry` (bulk)

Delete multiple items by ID array.

**Input:** `{ ids: string[] }`

Verify all IDs belong to the authenticated user before deleting. If **any** ID belongs to a different user, return 403 and delete nothing.

**Response:** 204 on success.

---

### 4f. `POST /api/pantry/import`

Upsert a batch of items from a grocery list or scan review.

**Input:**
```typescript
{
  items: { name: string, quantity: string | null, section: string | null }[]
}
```

**Upsert logic:**
For each item, check if `pantry_items` already has a row with the same `user_id` and `name` (case-insensitive trim). If yes, update `quantity` and `updated_at`. If no, insert a new row (auto-assign `section` via `assignSection` if the caller passes `null`).

**Response:** `{ imported: number, updated: number }` — 200

---

### 4g. `POST /api/pantry/scan`

Accept a base64-encoded image, pass it to Claude via the Anthropic SDK using vision, and return a structured list of detected ingredients.

**Input:** `{ image: string }` — base64 encoded image data (no `data:...` prefix required; strip if present)

**LLM call:**
Use `claude-sonnet-4-6` (or `process.env.LLM_MODEL`). Pass the image as a `base64` image block in the user message. Use a system prompt instructing the model to:
- Identify all visible food ingredients, condiments, and packaged goods
- Estimate quantities where confident (e.g. "1 dozen", "half a bag"), or leave quantity null
- Infer section using the grocery section taxonomy when obvious
- Return only JSON — no prose

**Prompt schema expected back from LLM:**
```json
{
  "detected": [
    { "name": "string", "quantity": "string | null", "section": "string | null" }
  ]
}
```

**Response (always 200, never errors on low confidence):**
```typescript
{
  detected: { name: string, quantity: string | null, section: string | null }[]
}
```

If the LLM response cannot be parsed or returns nothing, return `{ detected: [] }`.

---

### 4h. `POST /api/pantry/match`

Rank the user's recipes by how many pantry ingredients they use.

**Behavior:**
1. Fetch all `pantry_items` for the user.
2. Fetch the user's recipes (title, ingredients text, tags) — use `select('id, title, ingredients, tags')`.
3. Pass to LLM (system + user message — non-streaming). Ask the LLM to rank the recipes by overlap with the pantry list and return the top 5.
4. Parse the JSON response and return it.

**LLM prompt notes:**
- System: "You are a recipe matching assistant. Given a pantry contents list and a recipe catalog, rank the recipes by how many pantry ingredients they use. Return only valid JSON with no prose."
- User message: pantry items as a flat list of names, recipes as `[{ id, title, ingredients }]`
- Expected response format: `{ "matches": [{ "recipe_id": "...", "recipe_title": "...", "match_count": N, "matched_items": ["..."] }] }`

**Response:**
```typescript
{
  matches: PantryMatch[]  // up to 5, may be empty — never errors on low count
}
```

---

### 4i. Modify `POST /api/recipes/[id]/log`

After inserting into `recipe_history`, add a pantry deduction step (silent — does not affect the HTTP response):

1. Fetch the recipe's `ingredients` text field.
2. Parse each line with `parseIngredientLine` from `lib/grocery.ts` to get ingredient names.
3. Fetch all `pantry_items` for the user.
4. For each parsed ingredient name, fuzzy-match against pantry item names:
   - Match if pantry item name contains the ingredient token, or ingredient token contains the pantry item name (both lowercased, trimmed).
5. For each matched pantry item: delete it **only if** its `quantity` is `null` OR matches a clearly-singular pattern: `/^\d+\s*(can|cans|lb|lbs|oz|piece|pieces|item|items|pack|packs)$/i`.
   - Items with quantities like "some", "half a bag", "a few" are left untouched.
6. Use `createAdminClient()` for the delete to bypass RLS, after verifying `user_id` matches.

This is silent: the `POST /api/recipes/[id]/log` response shape is unchanged.

---

### 4j. Modify `POST /api/plan/suggest` (via `app/api/plan/helpers.ts`)

Inject pantry context into the user message passed to the LLM.

**In `helpers.ts`:**

Add a new exported helper:
```typescript
export async function fetchPantryContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string>
```

This fetches up to 30 pantry items (ordered by expiry_date ASC nulls last, then name), formats them as a compact list, and returns a string like:
```
Pantry items on hand (bias suggestions toward recipes using these, especially items expiring soon):
- chicken breast (expires 2026-03-25)
- canned tomatoes
- spinach (expires 2026-03-24)
...
```

Keep the block under 500 tokens — limit to 30 items.

**In `buildFullWeekUserMessage`:** add a `pantryContext: string` parameter (default `''`). Append it to the user message after the `specific_requests` block:
```
Pantry context:
${pantryContext || '(none)'}
```

**In `suggest/route.ts`:** call `fetchPantryContext(supabase, user.id)` and pass it to `buildFullWeekUserMessage`. The function signature change must be backward-compatible — existing callers of `buildFullWeekUserMessage` that don't pass `pantryContext` should default to `''`.

Also update `buildSwapUserMessage` the same way (add `pantryContext: string = ''` parameter).

---

### 4k. Modify `POST /api/groceries/generate`

After building the grocery item list, cross-reference each item against the user's pantry. Items where a pantry match is found should have `is_pantry: true` set (this field already exists on `GroceryItem`).

**Matching rule:** an item matches if the pantry contains an item whose name, when lowercased, is a substring of the grocery item name (lowercased), or vice versa. Only flag as `is_pantry: true` — never remove the item from the list.

Fetch pantry items using `createAdminClient()` after the user auth check.

---

## 5. UI Components

### 5a. `app/(app)/pantry/page.tsx`

Server component shell (same pattern as `app/(app)/groceries/page.tsx`):
```tsx
import PantryPageClient from '@/components/pantry/PantryPageClient'
export default function PantryPage() {
  return <PantryPageClient />
}
```

---

### 5b. `components/pantry/PantryPageClient.tsx`

Main client component for the pantry screen. Responsibilities:
- Fetch pantry items from `GET /api/pantry` on mount.
- Display items grouped by section using `PantrySection`.
- Render search input (client-side filter by name, case-insensitive substring).
- Render "Add item" button that shows `AddPantryItemInput` inline.
- Render "Scan Pantry" camera button that opens `ScanPantrySheet`.
- Render "What can I make?" button that calls `POST /api/pantry/match` and shows `PantryMatchSheet`.
- Render "Clear expired" button (only visible when expired items exist) — calls `DELETE /api/pantry` bulk with IDs of all expired items.
- Render "Clear all" button with a confirmation dialog.
- Handle optimistic add/delete/edit.

**Expiry logic (client-side):**
```typescript
function expiryStatus(expiry_date: string | null): 'expired' | 'soon' | 'fresh' | 'none' {
  if (!expiry_date) return 'none'
  const today = new Date(); today.setHours(0,0,0,0)
  const exp = new Date(expiry_date + 'T00:00:00')
  const diffDays = Math.floor((exp.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'expired'
  if (diffDays <= 3) return 'soon'
  return 'fresh'
}
```

---

### 5c. `components/pantry/PantrySection.tsx`

Renders a labeled section (e.g. "Produce") with its list of `PantryItemRow` children. Collapsed by default if the section has > 10 items (toggle open).

Props:
```typescript
{
  section: string
  items: PantryItem[]
  onEdit: (item: PantryItem) => void
  onDelete: (id: string) => void
}
```

---

### 5d. `components/pantry/PantryItemRow.tsx`

Single item row. Shows: name, quantity (muted), `ExpiryBadge`. Desktop: × delete button on hover. Clicking the row opens an inline edit for `quantity` and `expiry_date` (save via `PATCH /api/pantry/[id]`).

Props:
```typescript
{
  item: PantryItem
  onEdit: (item: PantryItem) => void
  onDelete: (id: string) => void
}
```

---

### 5e. `components/pantry/ExpiryBadge.tsx`

Renders a small badge for items with an expiry date:
- `expired` — muted red background, text `"Expired X days ago"` (where X = |diffDays|)
- `soon` — amber background, text `"Expires in X days"` (or `"Expires today"` if 0)
- `fresh` / `none` — renders nothing

Props: `{ expiry_date: string | null }`

---

### 5f. `components/pantry/AddPantryItemInput.tsx`

Inline quick-add form. Single text input (free text: `"2 cans tomatoes"`), optional expiry date picker (type="date"), and an optional section selector (same 8 sections as the grocery list). Submit calls `POST /api/pantry` and appends the returned item to local state.

On submit: if the name field is empty, show a validation error inline.

---

### 5g. `components/pantry/ScanPantrySheet.tsx`

Modal/sheet for the camera scan flow:

1. **Upload step:** renders a `<input type="file" accept="image/*" capture="environment">` (triggers camera on mobile, file picker on desktop). Also shows a manual file-drop zone.
2. **Loading step:** while `POST /api/pantry/scan` is in flight, show a spinner with "Scanning your pantry..."
3. **Review step:** shows a checklist of detected items. Each row: checkbox (default checked), item name (editable), quantity (editable). User can uncheck items they don't want.
4. **Confirm button:** calls `POST /api/pantry/import` with the checked items, then dismisses the sheet and refreshes the pantry list.

If the scan returns an empty array, show "Nothing detected — try a clearer photo."

---

### 5h. `components/pantry/PantryMatchSheet.tsx`

Modal/sheet for "What can I make?" results:

- Shows a loading state while `POST /api/pantry/match` is in flight.
- Lists up to 5 recipe matches. Each row: recipe title, "Uses N of your pantry items", list of matched item names (muted).
- Clicking a row navigates to `/recipes/[id]`.
- If matches is empty: "No close matches found. Try adding more pantry items."

---

### 5i. Modify `components/groceries/GotItSection.tsx`

Add an "Add to pantry" button (small, secondary style) next to each item in the "Got it" section. On click, calls `POST /api/pantry/import` with `[{ name: item.name, quantity: item.unit ? \`${item.amount} ${item.unit}\` : null, section: item.section }]`.

Also add an "Add all to pantry" button in the `GotItSection` footer (only visible when `items.length > 0`). On click, calls `POST /api/pantry/import` with all items in the "Got it" list.

Show a brief success toast ("Added to pantry") — a simple `<div>` that auto-dismisses after 2s is sufficient; no external toast library needed.

---

### 5j. Modify `components/layout/AppNav.tsx`

**Desktop (`CENTER_NAV` array):** insert `{ href: '/pantry', label: 'Pantry' }` after `{ href: '/groceries', label: 'Groceries' }` (i.e., between Groceries and the settings gear).

**Mobile (`MOBILE_NAV` array):** insert `{ href: '/pantry', label: 'Pantry', icon: '🥫' }` after the Groceries entry. The mobile nav will now have 7 items (Home, Recipes, Plan, Calendar, Groceries, Pantry, Settings) plus Sign out. This is acceptable — the existing `flex-1` layout handles variable counts.

---

## 6. Business Logic Rules

The Writer must enforce the following:

1. **Expiry thresholds:** expired = past today; soon = within 3 days (inclusive of today); fresh = 4+ days away. Use the `expiryStatus` function defined above throughout the UI. Never hardcode the 3-day threshold in multiple places — define it as `const EXPIRY_SOON_DAYS = 3` in the pantry client component or a shared pantry util.

2. **Free-text parsing:** reuse `parseIngredientLine` from `lib/grocery.ts` for the server-side POST handler. Extract `rawName` as the item name, format the amount + unit back into a freeform `quantity` string (e.g. `2 cans`). Section auto-assignment uses `assignSection` from the same file.

3. **Upsert deduplication:** case-insensitive, trim-normalized name comparison. Do not create duplicates.

4. **Pantry matching for grocery list:** use simple substring token matching (not LLM). Both directions: pantry item name ⊆ grocery item name, or grocery item name ⊆ pantry item name. Only flag items where you are confident of a match — when in doubt, leave `is_pantry: false`.

5. **Recipe log deduction:** silent (no response change). Only delete pantry items whose `quantity` is `null` or matches the singular pattern defined in §4i. Items with vague freeform quantities ("some", "half a bag") must not be deleted.

6. **Pantry context in suggestions:** limit to 30 items, sort by expiry ASC (soonest expiring first) so the most urgent items appear in the truncated context. Keep the total block under 500 tokens.

7. **"What can I make?" is best-effort:** if LLM returns fewer than 5 matches or an empty array, return what's available — never error on low match count.

8. **Scan is best-effort:** `POST /api/pantry/scan` always returns 200. If the LLM call throws or returns unparseable JSON, return `{ detected: [] }`.

9. **Section ordering on pantry screen:** render sections in the same order as `GrocerySection` in `types/index.ts` — Produce, Proteins, Dairy & Eggs, Pantry, Canned & Jarred, Bakery, Frozen, Other — plus an `Unsorted` bucket for items where `section` is null.

10. **Bulk delete authorization:** if any ID in a bulk delete request belongs to a different user, return 403 and delete nothing.

---

## 7. Test Cases

The Writer must cover all of the following:

| # | Test case | File hint |
|---|---|---|
| T01 | `GET /api/pantry` returns only current user's items | `app/api/pantry/__tests__/pantry.test.ts` |
| T02 | `POST /api/pantry` parses `"2 cans tomatoes"` → name `"tomatoes"`, quantity `"2 cans"` | same |
| T03 | `POST /api/pantry` auto-assigns `section: "Canned & Jarred"` for `"diced tomatoes"` | same |
| T04 | `PATCH /api/pantry/[id]` updates quantity and expiry_date | same |
| T05 | `DELETE /api/pantry/[id]` removes the item and returns 204 | same |
| T06 | `DELETE /api/pantry` (bulk) removes all specified items | same |
| T07 | `DELETE /api/pantry` (bulk) returns 403 if any ID belongs to a different user | same |
| T08 | `POST /api/pantry/import` inserts new item | same |
| T09 | `POST /api/pantry/import` updates existing item's quantity (case-insensitive match) | same |
| T10 | Pantry screen groups items by section | `components/pantry/__tests__/PantryPageClient.test.tsx` |
| T11 | Items expiring within 3 days show amber `ExpiryBadge` | `components/pantry/__tests__/ExpiryBadge.test.tsx` |
| T12 | Items past expiry show red `ExpiryBadge` with "Expired X days ago" | same |
| T13 | Items with no expiry date render no badge | same |
| T14 | "Clear expired" removes only expired items | `components/pantry/__tests__/PantryPageClient.test.tsx` |
| T15 | `POST /api/pantry/match` returns ranked matches | `app/api/pantry/__tests__/pantry-match.test.ts` |
| T16 | `POST /api/pantry/match` returns empty array gracefully (no error) | same |
| T17 | Grocery list flags pantry items as `is_pantry: true` in generate route | `app/api/groceries/__tests__/groceries.test.ts` |
| T18 | Grocery list fuzzy match: "chicken breast" matches pantry item "chicken" | same |
| T19 | "Add to pantry" from Got It section calls `POST /api/pantry/import` | `components/groceries/__tests__/GotItSection.test.tsx` |
| T20 | Help Me Plan user message includes pantry context block | `app/api/plan/__tests__/plan-api.test.ts` |
| T21 | Pantry context block is omitted (shown as `(none)`) when pantry is empty | same |
| T22 | `POST /api/pantry/scan` returns `{ detected: [] }` when LLM response is invalid JSON | `app/api/pantry/__tests__/pantry-scan.test.ts` |
| T23 | Scan review sheet shows detected items; unchecking prevents import | `components/pantry/__tests__/ScanPantrySheet.test.tsx` |
| T24 | Confirmed scan items are added via `POST /api/pantry/import` | same |
| T25 | Recipe log deducts pantry item with `null` quantity after cooking | `app/api/recipes/__tests__/log-and-scrape.test.ts` |
| T26 | Recipe log does NOT deduct pantry item with quantity `"some"` | same |
| T27 | `POST /api/pantry/[id]` (PATCH) returns 404 for non-existent or non-owned item | `app/api/pantry/__tests__/pantry.test.ts` |
| T28 | Pantry nav item appears in desktop `CENTER_NAV` and mobile `MOBILE_NAV` | `components/layout/__tests__/AppNav.test.tsx` |

---

## 8. Out of Scope

- Barcode scanning
- Automatic pantry deduction when a recipe is cooked (deduction is triggered by `POST /api/recipes/[id]/log` only)
- Pantry sharing between users
- Shopping history / purchase tracking
- Nutritional tracking from pantry
- Integration with grocery store APIs
- Low stock alerts / push notifications
- Swipe-to-delete gesture on mobile (× button is sufficient)
- "Done shopping" deduction flow (the brief lists this as optional — omit for this sprint)
- Pagination or infinite scroll on the pantry screen (all items load at once)

---

Awaiting owner approval before Writer proceeds.
