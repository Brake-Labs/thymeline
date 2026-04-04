# Brief 12 — Pantry Tracker

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/pantry`
**Target:** PR into `staging`
**Depends on:** Briefs 01–07 merged to staging

---

## User Story

As a Forkcast user, I want to track what's in my pantry so Forkcast can help me
use up ingredients before they go bad, avoid buying things I already have, and
surface recipes that match what I've got on hand.

---

## Core Concept

The pantry is a persistent inventory of ingredients the user has at home. It feeds
into two existing features:

1. **Grocery list** — pantry items are flagged as "already have" so the user doesn't
   buy duplicates
2. **Help Me Plan** — the LLM is aware of pantry contents and can bias suggestions
   toward recipes that use up ingredients nearing expiry

The pantry is not a rigid inventory system — it's a lightweight, forgiving tracker.
Users should be able to add items quickly and not feel burdened by maintaining it.

---

## Screens & Features

### 1. Pantry Screen (`/pantry`)

A new route in the main nav. Shows everything currently in the pantry.

**Layout:**
- Items grouped by section (same sections as grocery list: Produce, Proteins,
  Dairy & Eggs, Pantry, Canned & Jarred, Bakery, Frozen, Other)
- Each item shows: name, quantity (optional), expiry date (optional), days until
  expiry if set
- Items nearing expiry (within 3 days) highlighted with a warm amber indicator
- Items expired shown with a muted red indicator and "Remove?" prompt

**Adding items:**
- "Add item" button opens a quick-add input: name + optional quantity + optional
  expiry date
- Alternatively, import from the current grocery list ("Add bought items to pantry"
  button on the grocery list screen — see §Grocery Integration)
- Free text entry: user types "2 cans tomatoes" and the system parses it

**Editing items:**
- Tap an item to edit quantity or expiry date inline
- Swipe to delete (mobile) or × button (desktop)

**Bulk actions:**
- "Clear expired" button removes all expired items
- "Clear all" with confirmation

**Search:**
- Simple client-side filter by item name

**Scan Pantry** (/pantry — "Scan" button):

- Camera button on the pantry screen opens the device camera (or file picker on desktop)
- User takes or uploads a photo of their pantry/fridge/shelf
- Photo is sent to POST /api/pantry/scan — base64 encoded image passed to Claude via the Anthropic API with vision
- LLM identifies all visible ingredients, estimates quantities where possible, and returns a structured list
- Results shown in a review sheet before saving: user can uncheck items they don't want added, edit names/quantities
- On confirm: items are imported via POST /api/pantry/import

POST /api/pantry/scan:
typescript{ image: string }  // base64 encoded image
Response:
typescript{
  detected: {
    name:     string
    quantity: string | null
    section:  string | null
  }[]
}
Always returns 200. Empty array if nothing detected. Never errors on low confidence — include items the LLM is uncertain about and let the user review.

---

### 2. Grocery List Integration

**"Add to pantry" on grocery list:**
- Each item in the grocery list has an "Add to pantry" tap target (small + icon)
- When the user marks an item as "Got it" (already bought), offer "Add to pantry?"
  as a follow-up prompt
- "Add all bought items to pantry" button in the grocery list footer

**"Already have" flagging:**
- When generating a grocery list, cross-reference against pantry contents
- Items found in the pantry are flagged as "Already have" with a muted style and
  a pantry icon
- User can still add them to the list manually if needed (e.g. running low)
- Pantry matching is fuzzy — "chicken breast" matches "chicken" in the pantry

**Deducting from pantry:**
- Optional: when a grocery list is marked as "done shopping", offer to deduct
  purchased items from pantry (replace pantry quantities with newly bought amounts)

When POST /api/recipes/[id]/log is called:

- Fetch the recipe's ingredients
- Cross-reference against user's pantry items using fuzzy name matching
- For each matched pantry item: deduct it silently (delete the item if fully used, or leave it if quantity is ambiguous — freeform quantities can't be mathematically deducted)
- Specifically: only delete pantry items where the quantity is null or clearly singular (e.g. "1 can", "1 lb") — leave items with vague quantities ("some", "half a bag") untouched
- No confirmation prompt — deduction is automatic and silent

---

### 3. Help Me Plan Integration

When generating suggestions in `POST /api/plan/suggest`:
- Include the user's pantry contents in the LLM prompt context
- Instruct the LLM to:
  - Prefer recipes that use ingredients nearing expiry
  - Note when a suggested recipe uses pantry ingredients (surface as a "Uses pantry
    items" badge or reason string)
- Pantry context is supplementary — it biases suggestions but does not restrict them

---

### 4. Recipe Match ("What can I make?")

A lightweight feature on the pantry screen:

- "What can I make?" button
- Calls `POST /api/pantry/match` — sends pantry contents to the LLM
- LLM returns a ranked list of recipes from the vault that best match current
  pantry contents
- Results shown as a simple list with match score ("Uses 4 of your pantry items")
- Tapping a result opens the recipe detail page

---

## Data Model

### `pantry_items` table

```sql
create table pantry_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  quantity     text,           -- freeform: "2 cans", "1 lb", "half a bag"
  section      text,           -- same sections as grocery list
  expiry_date  date,
  added_at     timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table pantry_items enable row level security;

create policy "owner full access"
  on pantry_items for all
  using (auth.uid() = user_id);
```

### TypeScript

```typescript
export interface PantryItem {
  id:          string
  user_id:     string
  name:        string
  quantity:    string | null
  section:     string | null
  expiry_date: string | null   // "YYYY-MM-DD"
  added_at:    string
  updated_at:  string
}
```

---

## API Routes

### `GET /api/pantry`
Returns all pantry items for the current user, ordered by section then name.

### `POST /api/pantry`
Add a single item.

Input:
```typescript
{
  name:        string   // required
  quantity?:   string
  section?:    string
  expiry_date?: string  // "YYYY-MM-DD"
}
```

Behavior: parse `name` + `quantity` from free text if both arrive as a single
string (e.g. "2 cans tomatoes" → name: "tomatoes", quantity: "2 cans").
Use simple rule-based parsing first; LLM fallback only if parsing fails.

### `PATCH /api/pantry/[id]`
Update quantity or expiry date. Owner only.

### `DELETE /api/pantry/[id]`
Remove a single item. Owner only.

### `DELETE /api/pantry` (bulk)
Remove multiple items by ID array. Owner only.

Input: `{ ids: string[] }`

### `POST /api/pantry/import`
Import items from a grocery list.

Input:
```typescript
{
  items: { name: string, quantity: string | null, section: string | null }[]
}
```

Behavior: for each item, upsert into `pantry_items` — if an item with the same
name (case-insensitive) exists, update the quantity; otherwise insert new.

### `POST /api/pantry/match`
Find recipes in the vault that match pantry contents.

Behavior:
1. Fetch all pantry items
2. Fetch user's recipe list (title, ingredients, tags)
3. Pass to LLM: rank recipes by how many pantry ingredients they use
4. Return top 5 matches with match count

Response:
```typescript
{
  matches: {
    recipe_id:    string
    recipe_title: string
    match_count:  number
    matched_items: string[]   // pantry item names used in this recipe
  }[]
}
```

---

## UI Components

**`app/(app)/pantry/page.tsx`** — pantry screen
**`components/pantry/PantrySection.tsx`** — grouped section with items
**`components/pantry/PantryItem.tsx`** — single item row with edit/delete
**`components/pantry/AddItemInput.tsx`** — quick-add free text input
**`components/pantry/ExpiryBadge.tsx`** — colored expiry indicator
**`components/pantry/PantryMatchSheet.tsx`** — "What can I make?" results sheet

---

## Business Logic

1. **Expiry indicators:**
   - Expired (past today): muted red, "Expired X days ago"
   - Expiring soon (within 3 days): amber, "Expires in X days"
   - Fresh (4+ days): no indicator shown

2. **Fuzzy pantry matching for grocery list:** use simple substring/token
   matching (not LLM) — "chicken breast" matches "chicken", "diced tomatoes"
   matches "tomatoes". Flag as "Already have" only when confident.

3. **Section auto-assignment:** when adding an item, auto-assign section using
   the same rule-based logic as the grocery list parser in `lib/grocery.ts`.

4. **Free text parsing:** "2 cans diced tomatoes" → quantity: "2 cans",
   name: "diced tomatoes", section: "Canned & Jarred". Use rule-based parsing.
   If parsing confidence is low, store the full string as the name and let the
   user edit.

5. **Pantry context in Help Me Plan:** send pantry items to the LLM as a
   supplementary context block. Do not filter recipes by pantry — only bias.
   Keep the pantry context block under 500 tokens to avoid prompt bloat.

6. **"What can I make?" is best-effort:** if the LLM returns fewer than 5
   matches or no matches, return what's available. Never error on low match count.

7. **Upsert on import:** importing from grocery list uses case-insensitive name
   matching to avoid duplicates. Existing items get their quantity updated; new
   items are inserted.

8. **Pantry is additive on grocery list:** "Already have" flagging never removes
   an item from the grocery list automatically. The user decides whether to buy
   more.

---

## Nav

Add "Pantry" to `AppNav`:
- Desktop: between "Groceries" and the settings gear
- Mobile bottom nav: add as a 5th tab or combine with Groceries (Writer's call)

---

## Test Cases

| # | Test case |
|---|---|
| T01 | GET /api/pantry returns all items for current user |
| T02 | POST /api/pantry parses "2 cans tomatoes" into correct name/quantity |
| T03 | POST /api/pantry auto-assigns section for known ingredient types |
| T04 | PATCH /api/pantry/[id] updates quantity and expiry date |
| T05 | DELETE /api/pantry/[id] removes the item |
| T06 | DELETE /api/pantry (bulk) removes multiple items |
| T07 | POST /api/pantry/import upserts correctly — updates existing, inserts new |
| T08 | Pantry screen groups items by section |
| T09 | Items expiring within 3 days show amber indicator |
| T10 | Expired items show red indicator |
| T11 | "Clear expired" removes only expired items |
| T12 | "What can I make?" returns ranked recipe matches |
| T13 | Match count reflects number of pantry ingredients used |
| T14 | Grocery list flags pantry items as "Already have" |
| T15 | "Already have" flagging uses fuzzy matching |
| T16 | "Add to pantry" from grocery list calls POST /api/pantry/import |
| T17 | Help Me Plan prompt includes pantry context |
| T18 | Pantry nav item appears in desktop and mobile nav |
| T19 | POST /api/pantry/[id] returns 403 for non-owner |
| T20 | DELETE /api/pantry (bulk) returns 403 if any id is non-owned |
| T21 | Photo scan returns detected ingredients as structured list |
| T22 | Review sheet shows detected items; unchecking prevents import |
| T23 | Confirmed scan items are added to pantry via import |
| T24 | Logging a recipe as made deducts matched pantry items |
| T25 | Items with ambiguous quantities are not deducted |

---

## Out of Scope

- Barcode scanning
- Automatic pantry deduction when a recipe is cooked
- Pantry sharing between users
- Shopping history / purchase tracking
- Nutritional tracking from pantry
- Integration with grocery store APIs
- Low stock alerts / push notifications
