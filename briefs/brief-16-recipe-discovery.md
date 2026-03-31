# Brief 16 — Recipe Discovery

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/recipe-discovery`
**Target:** PR into `staging`
**Depends on:** Briefs 01–07 merged to staging

---

## User Story

As a Forkcast user, I want to discover new recipes on the web using natural
language — asking things like "what's the best simple sourdough blueberry muffin
recipe?" or "does Budget Bytes have any new main dish recipes I'd like?" or "find
me an easy slow cooker recipe that's unlike anything I already have" — and then
preview and save them directly to my vault.

---

## Core Concept

Recipe Discovery is a dedicated route (`/discover`) where users describe what
they're looking for in natural language. The AI searches the web, finds real
recipes, compares them against the user's existing vault to avoid duplicates and
surface complementary options, and presents results as previewable cards. Users
can scrape and preview a full recipe before deciding to save it.

The feature is powered by two things:
1. **Web search** — Anthropic's web search tool finds real recipe URLs
2. **Existing scrape infrastructure** — `POST /api/recipes/scrape` extracts the
   full recipe from any URL

---

## Screen Layout

### `/discover`

**Header:**
- Page title: "Discover Recipes" (Plus Jakarta Sans bold, 22px)
- Subtitle: "Find new recipes from across the web" (Manrope, muted)

**Search input:**
- Large, prominent search bar — full width
- Placeholder: "Ask anything — 'easy slow cooker recipes unlike anything I have' or 'Budget Bytes new dinner recipes'"
- Optional site filter: "Search a specific site" expandable field below the
  main input (text input, placeholder: "e.g. budgetbytes.com, seriouseats.com")
- "Discover" button (sage primary)
- Example prompts shown below input when empty (3–4 clickable chips):
  - "Simple sourdough recipes"
  - "New slow cooker dinners"
  - "Healthy weeknight meals"
  - "Desserts I haven't tried"

**Results area:**
- Loading state: skeleton cards while searching
- Results: grid of `DiscoveryCard` components (2 columns desktop, 1 mobile)
- Empty state: "No recipes found — try a different search"
- Error state: "Something went wrong — try again"

**Result card (`DiscoveryCard`):**
- Recipe title
- Source site name + favicon (if available)
- Short description or first sentence of recipe intro
- Tags suggested by AI (from `FIRST_CLASS_TAGS`)
- "Already in your vault" badge if a similar recipe exists (see §Vault Awareness)
- "Preview & Save" button (sage primary)
- "Dismiss" button (ghost, removes card from results)

**Preview sheet:**
- Opens as a full-page overlay or large modal when "Preview & Save" is clicked
- Calls `POST /api/recipes/scrape` with the recipe URL
- Shows a loading state while scraping
- On success: renders the full recipe in the standard recipe card design
  (same as `/recipes/[id]`) with all fields pre-filled
- "Save to Vault" button (sage primary) — saves via `POST /api/recipes`
- "Edit before saving" button (ghost) — opens the recipe in `RecipeForm` for
  editing before saving
- "Close" button — dismisses without saving

---

## API Routes

### `POST /api/discover`

**Purpose:** Search the web for recipes matching a natural language query,
compare against user's vault, and return ranked results.

**Auth:** Authenticated session required.

**Input:**
```typescript
{
  query:       string    // natural language query
  site_filter?: string  // optional domain (e.g. "budgetbytes.com")
}
```

**Behavior:**

1. **Fetch user's vault** — get recipe titles, tags, and ingredients summary
   to pass as vault context

2. **Build search query** — use the LLM to convert the natural language query
   into 2–3 effective web search queries:
   - Extract key ingredients, cuisine, style from the query
   - If `site_filter` is set: append `site:budgetbytes.com` to queries
   - Example: "easy slow cooker recipe unlike anything I have" →
     `["easy slow cooker recipes dinner", "simple slow cooker meals"]`

3. **Web search** — use Anthropic's web search tool to execute the queries.
   Collect up to 10 unique recipe URLs from results. Filter to URLs that look
   like actual recipes (contain `/recipe/`, `/recipes/`, common recipe site
   domains, or structured recipe schema indicators).

4. **LLM ranking + vault comparison** — pass the search results + user's vault
   to the LLM:
   - Rank results by relevance to the query
   - Flag results that are similar to existing vault recipes ("Already have
     something similar: [recipe name]")
   - Suggest tags from `FIRST_CLASS_TAGS` for each result
   - Return top 6 results

5. **Return results**

**Response:**
```typescript
{
  results: {
    title:           string
    url:             string
    site_name:       string
    description:     string | null
    suggested_tags:  string[]
    vault_match?: {
      similar_recipe_title: string
      similarity:           'exact' | 'similar' | 'complementary'
    }
  }[]
}
```

Always returns 200. Empty array if no results found.

**Errors:**
- `400` — empty query
- `500` — web search or LLM failure (log and surface generic message)

---

## Vault Awareness

When comparing search results against the user's vault:

- **Exact:** same recipe title or same URL already in vault → show "Already saved"
  badge, rank lower
- **Similar:** same main ingredient + same cooking method (e.g. two slow cooker
  chicken soups) → show "Similar to [recipe] in your vault" badge
- **Complementary:** matches the query but fills a gap in the vault (e.g. user
  has no Thai recipes, result is Thai) → no badge, rank higher

The LLM determines similarity based on title + tags + brief description.
No embedding or vector search — pure LLM judgment.

---

## Site Filter

When `site_filter` is provided:
- Append `site:[domain]` to all web search queries
- Show the active site filter as a removable pill above results
- If no results found for the site filter: show "No results found on
  [site] — try searching the whole web" with a "Search all sites" button
  that removes the filter and re-runs the query

---

## Saving a Recipe

When "Save to Vault" is clicked in the preview sheet:
1. The recipe was already scraped — use the scrape result directly
2. Call `POST /api/recipes` with all scraped fields + `source: 'scraped'`
3. On success: show "Saved to vault ✓" in the preview sheet
4. Show "View in vault →" link to `/recipes/[new_id]`
5. Update the `DiscoveryCard` in the results to show "Saved ✓" badge
6. Do not close the preview automatically — let the user choose to close or
   view in vault

When "Edit before saving":
1. Close the preview sheet
2. Open `AddRecipeModal` with the scraped recipe pre-filled in the Manual tab
3. User edits and saves normally

---

## Nav

Add "Discover" to `AppNav`:
- Desktop: between "Recipe Box" and "Plan"
- Mobile: add to nav (Writer's call on placement given space constraints)
- Icon: search/compass icon from lucide-react (`Compass` or `Search`)

---

## UI Components

```
app/(app)/discover/page.tsx              — discovery page
components/discover/DiscoverySearch.tsx  — search input + site filter + examples
components/discover/DiscoveryResults.tsx — results grid
components/discover/DiscoveryCard.tsx    — individual result card
components/discover/PreviewSheet.tsx     — full recipe preview + save
app/api/discover/route.ts                — POST endpoint
```

---

## Business Logic

1. **Web search is real** — this feature calls the actual web search tool. Results
   are real recipe URLs. The LLM does not hallucinate URLs.

2. **Scrape on demand** — recipes are not scraped until the user clicks
   "Preview & Save". The discovery results only contain metadata (title, URL,
   description). Full scrape happens on demand to avoid unnecessary API calls.

3. **Vault comparison is LLM-based** — no embeddings, no fuzzy string matching
   infrastructure. Pass vault titles + tags to the LLM with the results and ask
   it to flag similarities. Keep the vault context under 1000 tokens (truncate
   to most recent 50 recipes if vault is large).

4. **Suggested tags are validated** — filter returned tags against
   `FIRST_CLASS_TAGS` server-side before returning.

5. **Site filter is passed-through** — if `site_filter` is set, it's appended
   to search queries as `site:[domain]`. No whitelist of allowed domains — users
   can search any site. The LLM still filters to recipe-looking URLs.

6. **Results are ephemeral** — discovery results are not persisted. Each search
   returns fresh results. No search history in v1.

7. **"Dismiss" removes from UI only** — dismissed cards are removed from the
   results grid in client state. No server call needed.

8. **Duplicate saves prevented** — before calling `POST /api/recipes`, check if
   the URL already exists in the vault (`recipes.url`). If it does: show
   "Already in your vault" and link to the existing recipe instead of saving.

9. **Preview sheet scrape errors** — if scraping fails for a URL, show an inline
   error in the preview sheet: "Couldn't load this recipe — try opening it
   directly" with a link to the original URL.

10. **Mobile search** — the site filter field is hidden by default on mobile,
    accessible via a "Filter by site +" toggle.

---

## Test Cases

| # | Test case |
|---|---|
| T01 | `/discover` renders search input and example prompts |
| T02 | Submitting empty query shows validation error |
| T03 | POST /api/discover returns 400 for empty query |
| T04 | POST /api/discover returns results array |
| T05 | Results include suggested_tags filtered to FIRST_CLASS_TAGS |
| T06 | vault_match populated when similar recipe exists in vault |
| T07 | site_filter appends site: operator to search queries |
| T08 | No results for site filter shows "try all sites" prompt |
| T09 | DiscoveryCard renders title, site name, description, tags |
| T10 | "Already saved" badge shown when vault_match.similarity is 'exact' |
| T11 | "Preview & Save" opens PreviewSheet |
| T12 | PreviewSheet calls POST /api/recipes/scrape with the URL |
| T13 | PreviewSheet shows loading state while scraping |
| T14 | Scrape success renders full recipe in card design |
| T15 | "Save to Vault" calls POST /api/recipes with source: 'scraped' |
| T16 | Save success shows "Saved to vault ✓" and "View in vault →" link |
| T17 | Saving duplicate URL shows "Already in your vault" instead |
| T18 | "Edit before saving" opens AddRecipeModal with pre-filled fields |
| T19 | Scrape failure shows error with link to original URL |
| T20 | "Dismiss" removes card from results grid |
| T21 | Example prompt chips populate search input on click |
| T22 | Discover nav item appears in AppNav |
| T23 | Results grid renders 2 columns on desktop |

---

## Out of Scope

- Saving search history
- Bookmarking / saving results without scraping
- Community recipe sharing (different feature)
- Nutritional filtering in discovery search
- Recipe recommendations based on past cooking history
- Social features (what others are discovering)
- Curated recipe collections or editorial content
- Email digests of new discoveries
