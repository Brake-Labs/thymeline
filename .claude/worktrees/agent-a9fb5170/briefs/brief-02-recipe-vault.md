# Brief 02 — Recipe Vault

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/recipe-vault`
**Target:** PR into `staging`
**Depends on:** Brief 01 (scaffold) must be merged first

---

## User Story
As a Forkcast user, I want to store my recipes in one place — either by pasting
a URL to scrape or entering them manually — so I can browse, manage, and
eventually plan meals from my personal vault.

---

## Screens & Features

### 1. Recipe List (table view)
The main vault screen. Displays all recipes the user has access to (their own
+ any shared with them) in a sortable table.

**Columns:**
- Recipe Name (clickable, opens detail page)
- Category (main_dish, breakfast, dessert, side_dish — display as readable label)
- Tags (displayed as small pill badges, truncate if more than 3)
- Last Made (from recipe_history — show most recent date, or "Never")

**Actions on this screen:**
- "Add Recipe" button — opens the add recipe flow (see below)
- Sort by any column
- Filter by tag or category (simple dropdowns, not a full search)

---

### 2. Add Recipe Flow
Triggered by the "Add Recipe" button. Two entry modes, toggled by a tab:

**Tab A — Add by URL**
- Text input for a recipe URL
- "Scrape" button triggers the scrape API
- While scraping: show a loading state
- After scraping: pre-fill the recipe form with whatever was found:
  - Title
  - Ingredients (as a list)
  - Steps (as a numbered list)
  - Hero image (if found)
  - Source URL (always saved)
- If scraping finds partial data: show what was found, leave unfound fields
  empty with a placeholder like "Couldn't find this — add it manually"
- Never block saving due to incomplete scrape — user cleans up as needed
- User can edit any pre-filled field before saving

**Tab B — Manual Entry**
- All fields empty, user fills in from scratch
- Same form as above, no scraping

**Shared form fields (both tabs):**
- Title (required)
- Category (select: Main Dish, Breakfast, Dessert, Side Dish)
- Tags (multi-select from user's tag library — see CLAUDE.md)
- Ingredients (freeform text area — one ingredient per line)
- Steps (freeform text area — numbered steps)
- Notes (optional freeform)
- Source URL (optional for manual entry)
- Hero image (shown if scraped; user can remove it)

---

### 3. Recipe Detail Page
Route: `/recipes/[id]`

**Displays:**
- Hero image (if available)
- Title
- Category + Tags (pill badges)
- Ingredients list
- Numbered steps
- Notes
- Last made date + times made count
- Source URL as a clickable "View Original" link

**Actions:**
- **Edit** — opens the same form as Add Recipe, pre-filled
- **Add/remove tags** — inline tag editor without needing full edit mode
- **Log "Made Today"** — one-click button that adds today's date to recipe_history
- **Delete** — confirmation dialog before deleting; soft confirmation ("Are you
  sure? This can't be undone.")
- **Open original URL** — opens source URL in new tab (only shown if URL exists)
- **Share / Unshare** — toggle whether this recipe is visible to other Forkcast
  users (see Sharing section below)

---

## Sharing Model
- Each recipe has an `is_shared` boolean (default false)
- Shared recipes are visible to all authenticated Forkcast users in a read-only
  "Community" view (not in scope for this brief — just build the data model and
  the toggle)
- Users can only edit or delete their own recipes
- The share toggle lives on the recipe detail page

---

## API Routes

### `POST /api/recipes/scrape`
- Input: `{ url: string }`
- Calls Firecrawl (or equivalent scraper) to fetch the page
- Uses LLM to extract: title, ingredients, steps, hero image URL
- Returns: `{ title, ingredients, steps, imageUrl, sourceUrl, partial: bool }`
- `partial: true` if any field couldn't be extracted
- Never throws on partial extraction — always returns what it found

### `GET /api/recipes`
- Returns all recipes for the current user + all shared recipes
- Supports query params: `?category=`, `?tag=`

### `POST /api/recipes`
- Creates a new recipe
- Input: full recipe form fields
- Returns: created recipe with id

### `GET /api/recipes/[id]`
- Returns single recipe by id
- Only accessible if recipe belongs to user OR is_shared is true

### `PATCH /api/recipes/[id]`
- Updates recipe fields
- Only the owner can update

### `DELETE /api/recipes/[id]`
- Deletes recipe
- Only the owner can delete
- Returns 403 if not owner

### `POST /api/recipes/[id]/log`
- Logs today's date to recipe_history for this recipe
- Prevents duplicate entries for the same date

### `PATCH /api/recipes/[id]/share`
- Toggles is_shared boolean
- Only the owner can call this

---

## Database Changes
Add one column to the `recipes` table:

```sql
alter table recipes
  add column is_shared bool default false,
  add column ingredients text,
  add column steps text,
  add column image_url text;
```

Add RLS policies so users can only read/write their own recipes,
plus read access for shared recipes:

```sql
-- Enable RLS
alter table recipes enable row level security;
alter table recipe_history enable row level security;

-- Users can do anything with their own recipes
create policy "owner full access"
on recipes for all
using (auth.uid() = user_id);

-- Anyone authenticated can read shared recipes
create policy "read shared recipes"
on recipes for select
using (is_shared = true);

-- Users can do anything with their own history
create policy "owner history access"
on recipe_history for all
using (auth.uid() = user_id);
```

---

## UI Notes
- Use Tailwind throughout — no inline styles
- Tag pills: small, rounded, muted color (not distracting)
- "Log Made Today" button should feel satisfying — consider a subtle success
  state (checkmark, brief color change) after tapping
- The scrape loading state should communicate that something is happening —
  a spinner or progress message like "Reading recipe…"
- Mobile-friendly layouts — the detail page especially, since Cook Mode
  (a future feature) will build on top of it

---

## Out of Scope for This Brief
- Cook Mode (future brief)
- Community/browse view for shared recipes
- Recipe search (full text)
- Grocery list generation
- Meal planning integration
- Importing from Notion
- User-facing tag management UI (tags are selectable from existing library,
  but creating new tags is a future brief)

---

## Test Cases
- [ ] User can add a recipe by URL and see pre-filled form after scrape
- [ ] Partial scrape (missing steps) shows empty steps field, doesn't block save
- [ ] User can add a recipe manually with no URL
- [ ] Recipe appears in table after saving with correct columns
- [ ] Clicking recipe name opens detail page at `/recipes/[id]`
- [ ] "Log Made Today" adds entry to recipe_history and updates Last Made date
- [ ] Logging the same recipe twice on the same day doesn't create duplicate
- [ ] Edit saves changes and reflects them on detail page
- [ ] Delete with confirmation removes recipe from table
- [ ] Share toggle sets is_shared and is visible to other test users
- [ ] User cannot edit or delete another user's recipe (403 response)
- [ ] User CAN view another user's shared recipe
- [ ] Table sorts correctly by each column
- [ ] Tag filter returns only recipes with that tag

---

## How to Hand This to the Architect

Paste this entire brief into your Forkcast Architect session in AOE with
this message prepended:

> "You are the Forkcast Architect agent. Read CLAUDE.md in the root of
> this repo for your full instructions. Then read briefs/brief-02-recipe-vault.md
> and produce a full technical spec for the Writer agent to implement.
> Ask me if anything is ambiguous before writing the spec."
