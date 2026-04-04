# Brief 23 — Grocery List Generation

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/grocery-list`
**Target:** PR into `main`
**Depends on:** Briefs 01–07 merged to main

---

## User Story

As a Thymeline user, I want to select a date range of planned meals, generate
a consolidated grocery list with quantities combined across recipes, check off
what I already have, and share the final list to Apple Reminders, Google Tasks,
Messages, or any app on my phone — so I can get in and out of the grocery store
without thinking.

---

## Core Concept

The grocery list is generated from a user-selected date range of planned meals.
Ingredients are extracted from all recipes in that range, deduplicated, and
consolidated using LLM-based quantity reasoning (e.g. "1 cup + 2 tbsp flour →
1¼ cups flour"). Each consolidated item notes which recipes it came from.

Items are split into two groups with inverted default states:

**Group 1 — "Need to buy"** (fresh, perishable, specialty items)
- Default: unchecked (assume you need to buy it)
- Check off items you already have → they are excluded from the export
- Logic: unchecked = buy it

**Group 2 — "Pantry staples"** (oil, salt, flour, spices, canned goods)
- Default: unchecked (assume you have it)
- Check off items you're running low on → they are added to the export
- Logic: checked = buy it

**Export** = Group 1 unchecked + Group 2 checked, as a clean consolidated list.
Shared via the native OS share sheet (iOS/Android) or clipboard on web.

---

## Screens & Flow

### Entry point

"Grocery List" button on the meal plan calendar view — visible when at least
one recipe is planned in the current week. Also accessible from the main nav
as a standalone feature.

### Step 1 — Date range picker

A simple two-date picker (start date → end date). Defaults to the current week
(Monday → Sunday). User can adjust to any range.

- "Generate list" button — disabled until at least one recipe exists in the
  selected range
- Shows a count: "X recipes in this range"

### Step 2 — Grocery list view

The main screen. Two sections with inverted defaults as described above.

**Header:**
- "Grocery List" title
- Date range shown: "Mon Dec 2 – Sun Dec 8"
- "Regenerate" icon button (refresh icon) — re-runs generation for the same range
- "Share" button (top right, sage primary)

**Section 1 — "Need to buy"**
- Section label: "Need to buy" with item count
- Each item: checkbox (unchecked by default) + ingredient name + quantity +
  muted recipe attribution
- Checking an item marks it as "have it" — it visually dims and moves to a
  collapsed "Already have" subsection at the bottom of this group
- Unchecking restores it

**Section 2 — "Pantry staples"**
- Section label: "Pantry staples" with item count
- Each item: checkbox (unchecked by default) + ingredient name + quantity +
  muted recipe attribution
- Checking an item adds it to the export — it visually highlights with a
  subtle sage tint
- Unchecking removes it from export

**Item format:**
```
☐  2 lbs chicken thighs                    ← name + quantity
   Tikka Masala, Sheet Pan Chicken          ← muted recipe attribution
```

**"Already have" subsection** (collapsed by default, expandable):
- Shows checked items from Group 1
- Label: "Already have (X)" with a chevron to expand/collapse
- Items can be unchecked here to restore them to the main list

**Inline editing:**
- Tap any item to edit quantity or name inline
- Long-press to delete an item entirely
- "Add item" text link at the bottom of each section — opens a simple inline
  text input to add a custom item

### Step 3 — Share

Tapping "Share" opens a bottom sheet with:

**Export preview:**
- A clean plain-text preview of the final list (Group 1 unchecked + Group 2
  checked, no recipe attribution in the export — just ingredient + quantity)
- Formatted as:

```
Grocery List — Dec 2–8

NEED TO BUY
• 2 lbs chicken thighs
• 1 bag coleslaw mix
• 3 limes
• 1 cup heavy cream

ALSO GRABBING
• 1¼ cups flour
• 2 cans coconut milk
```

**Share options:**
- "Share" button — triggers the native OS share sheet (iOS share sheet /
  Android share sheet), which covers Apple Reminders, Google Tasks, Messages,
  WhatsApp, Notes, email, and any app the user has installed
- "Copy to clipboard" button — copies the plain text for web users or
  clipboard paste into any app
- On web (non-mobile): show clipboard copy + a "Send as text message" option
  that opens `sms:` with the list pre-filled

---

## API Routes

### `POST /api/grocery-list/generate`

Generates the consolidated grocery list from a date range.

**Input:**
```typescript
{
  start_date: string   // ISO date
  end_date:   string   // ISO date
}
```

**Behavior:**
1. Fetch all `meal_plan_entries` for the user/household in the date range,
   joined with recipe ingredients
2. Extract all ingredient text from all recipes
3. Call LLM to consolidate (see §LLM Prompt)
4. Classify each consolidated item as `need_to_buy` or `pantry_staple`
5. Return structured list

**Response:**
```typescript
{
  date_range: { start: string, end: string }
  recipe_count: number
  items: {
    id:           string     // client-generated uuid for checkbox state
    name:         string     // e.g. "chicken thighs"
    quantity:     string     // e.g. "2 lbs"
    recipes:      string[]   // recipe titles this ingredient comes from
    group:        'need_to_buy' | 'pantry_staple'
  }[]
}
```

**Errors:**
- `400` — no recipes found in range
- `500` — LLM failure

---

## LLM Prompt

### System message

```
You are a grocery list assistant. You will receive ingredient lists from
multiple recipes. Your job is to:

1. Deduplicate ingredients across recipes (e.g. "2 cloves garlic" from one
   recipe and "3 cloves garlic" from another become "5 cloves garlic")
2. Consolidate quantities intelligently using standard units where possible
   (e.g. "1 cup + 2 tbsp flour" → "1¼ cups flour")
3. Classify each ingredient as either:
   - "need_to_buy": fresh produce, meat, dairy, specialty ingredients,
     anything perishable or recipe-specific
   - "pantry_staple": oil, salt, pepper, sugar, flour, dried spices, canned
     goods, vinegar, soy sauce, and similar items most households keep stocked
4. Track which recipes each ingredient comes from

Return ONLY valid JSON with no markdown fences:
{
  "items": [
    {
      "name": "chicken thighs",
      "quantity": "2 lbs",
      "recipes": ["Chicken Tikka Masala", "Sheet Pan Chicken"],
      "group": "need_to_buy"
    }
  ]
}
```

### User message

```
Generate a consolidated grocery list from these recipes:

{for each recipe:}
RECIPE: {title}
Ingredients:
{ingredients}

---
{end for}
```

---

## UI Components

```
app/(app)/grocery/page.tsx                    — grocery list page
components/grocery/DateRangePicker.tsx        — step 1 date range
components/grocery/GroceryListView.tsx        — step 2 main list view
components/grocery/GroceryItem.tsx            — individual item row
components/grocery/GroceryShareSheet.tsx      — step 3 share bottom sheet
lib/grocery-share.ts                          — share/export logic
```

### `lib/grocery-share.ts`

```typescript
export function formatListAsText(
  items: GroceryItem[],
  dateRange: { start: string, end: string }
): string
// Formats the final export list as plain text

export function shareViaOS(text: string): void
// Calls navigator.share() on mobile, falls back to clipboard on web

export function copyToClipboard(text: string): Promise<void>
```

---

## Business Logic

1. **Checkbox state is client-only** — the checked/unchecked state of each
   item is managed in component state, not persisted to the DB. Refreshing the
   page resets all checks. This is intentional — grocery lists are ephemeral.

2. **LLM consolidation is best-effort** — quantities with incompatible units
   (e.g. "3 sprigs thyme" + "1 tsp dried thyme") are listed separately rather
   than forced into a bad consolidation. The LLM is instructed to leave
   incompatible units as separate items.

3. **Recipe attribution is shown in the list, not the export** — the "Tikka
   Masala, Sheet Pan Chicken" attribution helps the user understand where items
   come from while editing. The plain-text export strips attribution for
   cleanliness.

4. **Native share sheet** — `navigator.share()` on iOS/Android triggers the
   native share sheet which covers Apple Reminders, Google Tasks, Messages,
   WhatsApp, etc. No need to build individual integrations. Falls back to
   clipboard copy on desktop web where `navigator.share()` is unavailable.

5. **Inline editing is local** — edits to quantity or item name are stored in
   component state only. They are reflected in the export but not saved back
   to the recipe.

6. **"Add item" is local** — custom items added by the user appear in the list
   and export but are not saved anywhere. They reset on page refresh.

7. **Household scope** — fetches meal plan entries for all household members.
   Recipes planned by any household member are included.

8. **Empty range** — if no recipes are planned in the selected date range, show
   an empty state: "No recipes planned for this period. Add some meals to your
   plan first." with a link to the calendar.

9. **LLM failure** — if consolidation fails, fall back to a raw deduplicated
   list (group by ingredient name, concatenate quantities without consolidating).
   Show a subtle notice: "Some quantities couldn't be combined automatically."

10. **"Regenerate"** — re-runs the LLM consolidation for the same date range.
    Resets all checkbox state. Asks for confirmation: "Regenerating will reset
    your current list. Continue?"

---

## Test Cases

| # | Test case |
|---|---|
| T01 | Date range picker defaults to current week |
| T02 | "Generate list" disabled when no recipes in range |
| T03 | POST /api/grocery-list/generate returns consolidated items |
| T04 | Ingredients from two recipes with same item are consolidated |
| T05 | Quantities consolidated correctly (1 cup + 2 tbsp → 1¼ cups) |
| T06 | Incompatible units listed as separate items |
| T07 | Each item includes recipe attribution |
| T08 | Items correctly classified as need_to_buy or pantry_staple |
| T09 | need_to_buy items default to unchecked |
| T10 | pantry_staple items default to unchecked |
| T11 | Checking need_to_buy item moves it to "Already have" |
| T12 | Checking pantry_staple item adds sage tint and includes in export |
| T13 | Unchecking restores item to default state |
| T14 | Export includes unchecked need_to_buy + checked pantry_staple |
| T15 | Export excludes checked need_to_buy items |
| T16 | Export excludes unchecked pantry_staple items |
| T17 | Inline quantity edit reflected in export |
| T18 | Custom "Add item" appears in list and export |
| T19 | formatListAsText produces correct plain text output |
| T20 | shareViaOS calls navigator.share() on mobile |
| T21 | shareViaOS falls back to clipboard on desktop |
| T22 | LLM failure falls back to raw deduplication |
| T23 | Regenerate resets checkbox state |
| T24 | Empty date range shows empty state message |
| T25 | Household: recipes from all members included |

---

## Out of Scope

- Persisting the grocery list or checkbox state across sessions
- Syncing directly with Apple Reminders or Google Tasks via API/OAuth
- Aisle grouping (produce, dairy, meat, etc.)
- Price estimation
- Barcode scanning
- Integration with pantry to auto-check stocked items
- Multiple saved grocery lists
- Sharing the list with household members in-app
