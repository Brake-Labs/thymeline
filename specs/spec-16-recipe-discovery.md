# Spec 16 — Recipe Discovery

**Brief:** `briefs/brief-16-recipe-discovery.md`
**Branch:** `feature/recipe-discovery` (branch from `staging`)
**Depends on:** Briefs 01–07 merged to staging

---

## 1. Summary

Add a `/discover` route where users describe what they want in natural language.
The server converts the query into web search queries, uses Anthropic's web search
tool to find real recipe URLs, ranks those results against the user's existing
vault, and returns up to 6 cards. Users can preview a full recipe (scraping on
demand via the existing `/api/recipes/scrape` endpoint) and save directly to their
vault or open it pre-filled in `AddRecipeModal` for editing before saving.

---

## 2. DB Changes

**None.** Discovery results are ephemeral — not persisted. No new tables or
migrations are required.

---

## 3. API Routes

### `POST /api/discover`

**Auth:** Authenticated session required (Bearer token, same pattern as all
other API routes).

**Input:**
```typescript
{
  query:        string   // required; non-empty after trim
  site_filter?: string   // optional domain, e.g. "budgetbytes.com"
}
```

**Validation:**
- Return `400 { error: 'Query is required' }` if `query` is empty/missing after trim.

**Behavior — five sequential steps:**

#### Step 1 — Fetch vault context
Query the `recipes` table for the authenticated user. Select `title`, `tags`, and
`category` only. Limit to the most recently created 50 rows (order by
`created_at DESC`). This vault context is passed to the LLM in later steps.
Format as a compact JSON array: `[{ title, tags }]`.

#### Step 2 — Generate search queries
Call the Anthropic API using `lib/llm.ts`'s exported `anthropic` client.
Model: `claude-haiku-4-5-20251001`. Temperature: 0.

Prompt the LLM to produce 2–3 optimized web search query strings from the
user's natural language input. If `site_filter` is set, each query string must
include `site:[domain]` (e.g. `site:budgetbytes.com`). The LLM should extract
key ingredients, cooking method, and cuisine style from the query.

Parse the LLM response as a JSON array of strings. On parse failure, fall back
to using the raw `query` string as a single search query.

#### Step 3 — Web search
Use the Anthropic web search tool. Model: `claude-haiku-4-5-20251001`.
Max tokens: 4096.

```typescript
await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 4096,
  tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
  messages: [
    {
      role: 'user',
      content: `Search for recipes using these queries and return the URLs and
titles of real recipe pages you find. Queries: ${JSON.stringify(searchQueries)}.
Return a JSON array of { url, title, site_name, description } objects — up to
10 results. Only include URLs that look like actual recipe pages (containing
/recipe/, /recipes/, or from known recipe domains). Do not invent URLs.`
    }
  ]
})
```

Parse the final assistant message for a JSON array of results. Deduplicate by
URL. Keep up to 10 results.

#### Step 4 — Rank, compare against vault, suggest tags
Single LLM call. Model: `claude-haiku-4-5-20251001`. Temperature: 0.

Pass:
- The 10 search results (url, title, site_name, description)
- The vault context (array of `{ title, tags }`)
- The user's original query
- The full `FIRST_CLASS_TAGS` list from `lib/tags.ts`

Prompt the LLM to:
1. Rank results by relevance to the query (best match first)
2. For each result, suggest 0–4 tags from `FIRST_CLASS_TAGS` only
3. For each result, optionally flag a vault match:
   - `exact` — same title or same URL already in vault
   - `similar` — same main ingredient + cooking method as an existing vault recipe
   - `complementary` — fills a gap (omit vault_match key entirely for these)
4. Return top 6 results

Expected LLM output — JSON array:
```typescript
Array<{
  url:           string
  title:         string
  site_name:     string
  description:   string | null
  suggested_tags: string[]
  vault_match?: {
    similar_recipe_title: string
    similarity: 'exact' | 'similar'
  }
}>
```

#### Step 5 — Validate and return
Server-side: filter each result's `suggested_tags` against `FIRST_CLASS_TAGS`
(imported from `lib/tags.ts`). Remove any tags not in that list. Do not include
user custom tags — web search context has no awareness of them.

Return `200` with:
```typescript
{
  results: Array<{
    title:          string
    url:            string
    site_name:      string
    description:    string | null
    suggested_tags: string[]          // validated against FIRST_CLASS_TAGS
    vault_match?: {
      similar_recipe_title: string
      similarity: 'exact' | 'similar'
    }
  }>
}
```

Always returns `200`. Empty `results: []` if no results found or all were
filtered. Never surface raw LLM errors to the client — log them server-side and
return empty results.

**Errors:**
- `400` — empty query (only error that surfaces to client)
- `500` — web search or LLM failure; log error, return `{ error: 'Search failed — please try again' }`

---

## 4. UI Components

```
app/(app)/discover/
  page.tsx                              — server component; renders DiscoveryPageClient

components/discover/
  DiscoveryPageClient.tsx               — client component; owns search + results state
  DiscoverySearch.tsx                   — search bar, site filter, example chips
  DiscoveryResults.tsx                  — results grid (or loading/empty/error states)
  DiscoveryCard.tsx                     — individual result card
  PreviewSheet.tsx                      — full-screen overlay for preview + save

app/api/discover/
  route.ts                              — POST handler
```

### `app/(app)/discover/page.tsx`
Server component. No data fetching. Renders `<DiscoveryPageClient />`.
Page-level layout uses the standard `(app)` layout (AppNav + page wrapper).

### `DiscoveryPageClient.tsx`
Client component. Manages:
- `query: string` — current search input
- `siteFilter: string` — site filter input
- `results: DiscoveryResult[]` — search results
- `dismissedUrls: Set<string>` — URLs dismissed by user (client-only)
- `status: 'idle' | 'loading' | 'done' | 'error'`

Renders: page header, `<DiscoverySearch />`, and `<DiscoveryResults />`.

When search is submitted:
1. Set `status = 'loading'`, clear previous results
2. POST `/api/discover` with `{ query, site_filter: siteFilter || undefined }`
3. On success: set `results`, `status = 'done'`
4. On error: set `status = 'error'`

"Dismiss" handler: add URL to `dismissedUrls`. `DiscoveryResults` filters these out.

### `DiscoverySearch.tsx`

Props:
```typescript
{
  query:         string
  siteFilter:    string
  isLoading:     boolean
  onQueryChange: (q: string) => void
  onSiteChange:  (s: string) => void
  onSubmit:      () => void
}
```

Layout:
- Page title: "Discover Recipes" — `font-display font-bold text-[22px] text-[#1F2D26]`
- Subtitle: "Find new recipes from across the web" — `font-body text-sm text-[#6B7280]`
- Search bar: full-width `<input>` + "Discover" button (sage primary: `bg-[#4A7C59] text-white`)
  - Placeholder: `"Ask anything — 'easy slow cooker recipes unlike anything I have' or 'Budget Bytes new dinner recipes'"`
  - Pressing Enter submits
  - Button disabled + shows spinner while `isLoading`
- Site filter: hidden by default on mobile, visible on desktop below the main input
  - On mobile: "Filter by site +" toggle reveals the field
  - Label: "Search a specific site"
  - Placeholder: `"e.g. budgetbytes.com, seriouseats.com"`
- Active site filter pill: if `siteFilter` is non-empty and results are shown, render a
  removable pill above results: `"Site: [domain] ×"` — clicking × clears the filter
  and re-triggers search automatically
- Example prompt chips (shown when `query` is empty, hidden once user types):
  - "Simple sourdough recipes"
  - "New slow cooker dinners"
  - "Healthy weeknight meals"
  - "Desserts I haven't tried"
  - Clicking a chip sets the query and immediately submits

### `DiscoveryResults.tsx`

Props:
```typescript
{
  results:       DiscoveryResult[]
  dismissedUrls: Set<string>
  status:        'idle' | 'loading' | 'done' | 'error'
  siteFilter:    string
  onDismiss:     (url: string) => void
  onClearSiteFilter: () => void
  getToken:      () => Promise<string>
  onSaved:       () => void
}
```

States:
- `idle` — render nothing (empty page body)
- `loading` — render 6 skeleton cards (2-col desktop, 1-col mobile grid)
- `done`, visible results — render grid of `DiscoveryCard`
- `done`, 0 visible results (all dismissed or none returned):
  - If `siteFilter` is set: `"No results found on [site] — try searching the whole web"` +
    `"Search all sites"` button that calls `onClearSiteFilter()` and re-submits
  - Otherwise: `"No recipes found — try a different search"`
- `error` — `"Something went wrong — try again"`

Grid: `grid grid-cols-1 md:grid-cols-2 gap-4`

Manages `PreviewSheet` visibility: which `DiscoveryResult` is currently being previewed
(`previewingResult: DiscoveryResult | null`). Passing `null` closes the sheet.

Also tracks `savedUrls: Set<string>` to pass down to `DiscoveryCard` (so a card shows
"Saved ✓" after the user saves it from the preview sheet).

### `DiscoveryCard.tsx`

Props:
```typescript
{
  result:    DiscoveryResult
  saved:     boolean              // true if URL has been saved this session
  onPreview: (result: DiscoveryResult) => void
  onDismiss: (url: string) => void
}
```

Layout (cream bg `#FFFDF9`, border, rounded-lg, sage top accent bar — matches existing card style):
- Source: favicon (`https://www.google.com/s2/favicons?domain=[site_name]`) + site name
  — small, muted, top of card
- Title: `font-display font-semibold` (2-line clamp)
- Description: `text-sm text-gray-600` (3-line clamp), only if non-null
- Tags: up to 3 suggested tags as pills (sage-50 bg, sage-700 text — same style as `RecipeCard`)
- Vault match badge (if `vault_match` is present):
  - `similarity === 'exact'`: `"Already saved"` badge (gray/neutral pill)
  - `similarity === 'similar'`: `"Similar to [similar_recipe_title]"` badge (amber/yellow pill)
- If `saved`: show `"Saved ✓"` badge (sage green pill) replacing the action buttons
- Action buttons (bottom of card, flex row):
  - `"Preview & Save"` — sage primary button — calls `onPreview(result)`
  - `"Dismiss"` — ghost button — calls `onDismiss(result.url)`

### `PreviewSheet.tsx`

Props:
```typescript
{
  result:    DiscoveryResult
  getToken:  () => Promise<string>
  onClose:   () => void
  onSaved:   (url: string) => void    // called after successful save
  onEditBeforeSaving: (scrapeResult: ScrapeResult) => void
}
```

Full-page overlay (`fixed inset-0 z-50 bg-black/50`, inner panel scrollable, max-w-3xl centered).

**Internal states:** `'loading' | 'ready' | 'saving' | 'saved' | 'error'`

**On mount:**
- Set state `'loading'`
- POST `/api/recipes/scrape` with `{ url: result.url }`
- On success: store `scrapeResult`, set state `'ready'`
- On error: set state `'error'`

**Loading state:** spinner + `"Loading recipe…"` message

**Error state:** inline message: `"Couldn't load this recipe — try opening it directly"`
with a link to `result.url` (opens in new tab). Close button still visible.

**Ready state — layout:**
- Header: recipe title (from scrape result, fallback to `result.title`), Close `×` button
- If `scrapeResult.image_url`: full-width image, max-h `320px`, `object-cover`
- Metadata row: prep / cook / total time, servings (using existing time display pattern
  from `RecipeCard` — show only fields that are non-null)
- Tags: `scrapeResult.suggestedTags` rendered as pills (same style as RecipeCard)
- Ingredients section: `<pre>`-style or plain `whitespace-pre-wrap` display
- Steps section: same
- Notes: if non-null
- **Footer (sticky at bottom of panel):**
  - `"Save to Vault"` button (sage primary) — disabled while `saving`
  - `"Edit before saving"` button (ghost) — calls `onEditBeforeSaving(scrapeResult)` and `onClose()`
  - `"Close"` button (ghost)

**Before saving — duplicate check:**
Check if `result.url` already exists in the vault by calling `GET /api/recipes?url=[encoded_url]`
(see §5 — the Writer must confirm this param is supported, or implement an alternative
inline check). If a match is found, replace "Save to Vault" with `"Already in your vault"`
(disabled) + a `"View →"` link to `/recipes/[existing_id]`.

> **Note to Writer:** If `GET /api/recipes` does not support URL filtering, add a minimal
> check: after `scrapeResult` is loaded, query `GET /api/recipes` and filter client-side for
> a matching `url` field. Do not add a new API endpoint for this alone.

**Saving:**
1. Set state `'saving'`
2. POST `/api/recipes` with all fields from `scrapeResult` mapped to the recipe input shape,
   plus `source: 'scraped'`
3. On success: set state `'saved'`, call `onSaved(result.url)`
4. Show: `"Saved to vault ✓"` (sage green), `"View in vault →"` link to `/recipes/[new_id]`
5. Do not auto-close — let user choose

**ScrapeResult type** (local to discover components, matches the shape already used in
`AddRecipeModal.tsx`):
```typescript
interface ScrapeResult {
  title:               string | null
  ingredients:         string | null
  steps:               string | null
  imageUrl:            string | null
  sourceUrl:           string
  partial:             boolean
  suggestedTags:       string[]
  suggestedNewTags:    { name: string; section: string }[]
  prepTimeMinutes:     number | null
  cookTimeMinutes:     number | null
  totalTimeMinutes:    number | null
  inactiveTimeMinutes: number | null
  servings:            number | null
}
```

---

## 5. Types

Add to `types/index.ts`:

```typescript
export interface DiscoveryResult {
  title:          string
  url:            string
  site_name:      string
  description:    string | null
  suggested_tags: string[]
  vault_match?: {
    similar_recipe_title: string
    similarity: 'exact' | 'similar'
  }
}
```

---

## 6. Nav Changes — `components/layout/AppNav.tsx`

**Desktop (`CENTER_NAV` array):** Insert `/discover` between `Recipes` and `Plan`:
```typescript
{ href: '/discover', label: 'Discover' },
```

**Mobile (`MOBILE_NAV` array):** Insert between Recipes and Plan:
```typescript
{ href: '/discover', label: 'Discover', icon: '🧭' },
```

Icon choice is the Writer's call given mobile space constraints — `Compass` or `Search`
from `lucide-react` is recommended per the brief.

> The mobile nav currently has 7 items. The Writer should assess whether a bottom tab
> bar overflow pattern is needed or whether 8 items fit. If space is tight, the Writer
> may render "Discover" as an icon-only item on mobile with a tooltip.

---

## 7. `AddRecipeModal` — New Prop for "Edit before saving"

`AddRecipeModal` currently has no way to receive a pre-scraped result from an external
caller. Add a new optional prop:

```typescript
interface AddRecipeModalProps {
  // ...existing props...
  prefillScrapeResult?: ScrapeResult   // from discover flow
}
```

When `prefillScrapeResult` is provided:
- Initialize `tab` as `'url'`
- Initialize `scrapeResult` state with the provided value (skip the URL input step entirely)
- The modal opens directly to the `RecipeForm` with fields pre-filled, as if the user
  had already scraped the URL themselves

This is a backwards-compatible change — existing callers pass nothing and behavior is
unchanged.

---

## 8. Business Logic Rules

1. **Web search uses real Anthropic web search tool** — `{ type: 'web_search_20250305' }`.
   The LLM must not hallucinate URLs. The server instructs the LLM to return only URLs
   it found via the search tool.

2. **Scrape on demand** — the `/api/discover` endpoint returns metadata only (title, URL,
   description). No scraping occurs until the user clicks "Preview & Save".

3. **Tag validation is server-side** — `suggested_tags` in `/api/discover` response are
   filtered against `FIRST_CLASS_TAGS` from `lib/tags.ts` before returning. No user custom
   tags in discovery suggestions (the LLM doesn't have visibility into custom tags).

4. **Vault comparison is LLM-based** — no embeddings, no fuzzy string matching. Pass vault
   titles + tags as compact JSON. Cap at 50 most recent recipes to stay under ~1000 tokens.

5. **Site filter is pass-through** — any domain string is accepted. No allowlist. Append
   `site:[domain]` to all search queries when set.

6. **Results are ephemeral** — no server-side persistence of search results. No search history.

7. **Dismiss is client-only** — add URL to a `Set<string>` in client state. No API call.

8. **Duplicate URL check before saving** — before calling `POST /api/recipes` in
   `PreviewSheet`, check the current user's vault for a recipe with the same `url`. Show
   "Already in your vault" if found (see §4 PreviewSheet note on implementation).

9. **Scrape error in PreviewSheet** — show inline error + link to original URL. Do not
   propagate the raw error message.

10. **Site filter "no results" UX** — when results array is empty and `siteFilter` was set,
    show a prompt to search all sites. Clicking "Search all sites" clears `siteFilter` and
    re-submits the original query.

---

## 9. Test Cases

All test cases from the brief must be covered:

| # | Test case | Notes |
|---|---|---|
| T01 | `/discover` renders search input and example prompts | Check chips render when query is empty |
| T02 | Submitting empty query shows client-side validation error | No API call made |
| T03 | `POST /api/discover` returns 400 for empty query | Server validation |
| T04 | `POST /api/discover` returns results array | Mock web search + LLM |
| T05 | Results include `suggested_tags` filtered to `FIRST_CLASS_TAGS` | Tags outside list stripped |
| T06 | `vault_match` populated when similar recipe exists in vault | Mock vault data |
| T07 | `site_filter` appends `site:` operator to search queries | Assert in query-gen step |
| T08 | No results for site filter shows "try all sites" prompt | `status = 'done'`, empty results, siteFilter set |
| T09 | `DiscoveryCard` renders title, site name, description, tags | |
| T10 | "Already saved" badge shown when `vault_match.similarity === 'exact'` | |
| T11 | "Preview & Save" opens `PreviewSheet` | |
| T12 | `PreviewSheet` calls `POST /api/recipes/scrape` with the URL | |
| T13 | `PreviewSheet` shows loading state while scraping | |
| T14 | Scrape success renders title, ingredients, steps | |
| T15 | "Save to Vault" calls `POST /api/recipes` with `source: 'scraped'` | |
| T16 | Save success shows "Saved to vault ✓" and "View in vault →" link | |
| T17 | Saving duplicate URL shows "Already in your vault" instead | Pre-save duplicate check |
| T18 | "Edit before saving" opens `AddRecipeModal` with pre-filled fields | Via `prefillScrapeResult` prop |
| T19 | Scrape failure shows error with link to original URL | |
| T20 | "Dismiss" removes card from results grid | Client-state only |
| T21 | Example prompt chips populate search input on click and submit | |
| T22 | Discover nav item appears in `AppNav` | Both desktop and mobile |
| T23 | Results grid renders 2 columns on desktop | `md:grid-cols-2` |

---

## 10. Out of Scope

Matches brief exactly:
- Search history / saved searches
- Bookmarking results without scraping
- Community recipe sharing
- Nutritional filtering in discovery
- Recipe recommendations from cooking history
- Social features
- Curated collections or editorial content
- Email digests of discoveries

---

Awaiting owner approval before Writer proceeds.
