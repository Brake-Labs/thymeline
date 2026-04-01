# Spec 17 — Bulk Import

**Brief:** `briefs/brief-17-bulk-import.md`
**Branch:** `feature/bulk-import` (branch from `staging`)
**Depends on:** Briefs 01–07 merged to staging

---

## 1. Summary

Add a `/import` route where users can import their existing recipe library in bulk
via pasted URLs or file uploads (CSV, Paprika, Plan to Eat, Whisk/Samsung Food,
Notion CSV). All methods funnel into a shared review + save pipeline. The wizard
has four steps: Choose Source → Progress (URL only) → Review → Done.

Entry point: an "Import Recipes" button in the Recipe Box toolbar links to `/import`.
Import is a utility feature — it does not appear in the main `AppNav`.

---

## 2. DB Changes

**None.** The existing `recipes`, `recipe_history`, and `custom_tags` tables are
sufficient. No new migrations are required.

> **Note:** In-memory job storage is used for URL import jobs (see §8 rule 3).
> No `import_jobs` table is needed for v1.

---

## 3. New Dependency

**JSZip is not currently installed.** The Writer must add it:

```bash
npm install jszip
npm install --save-dev @types/jszip
```

JSZip is used server-side only (in `lib/import/parse-paprika.ts`). It must not
be imported by any client component.

---

## 4. API Routes

All routes use `withAuth()` from `lib/auth.ts` and household scoping via
`lib/household.ts`. None use `parseBody()` except where the body is JSON
(file uploads use `req.formData()` instead).

---

### `POST /api/import/urls`

**Auth:** `withAuth()`

**Body (JSON):** validated with `parseBody()` against a new `importUrlsSchema`:
```typescript
// lib/schemas.ts — add:
export const importUrlsSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(200),
})
```

**Behavior:**
1. Generate a `job_id` with `crypto.randomUUID()`
2. Store a new job entry in the module-level `importJobs` Map (see §8 rule 3)
3. Begin background scraping — do NOT await (fire and forget)
4. Return `{ job_id, total: urls.length }` immediately with status `202`

The background scrape process (described in §8 rules 1–2) updates the job entry
in-place as each URL completes.

**Response:** `202 { job_id: string, total: number }`

---

### `GET /api/import/[job_id]`

**Auth:** `withAuth()`

**Behavior:**
1. Look up `job_id` in the `importJobs` Map
2. Return `404` if not found or expired
3. Verify the job belongs to the requesting user (stored on the job entry)
4. Return current job state

**Response:** `200`
```typescript
{
  job_id:    string
  total:     number
  completed: number
  results: {
    url:        string
    status:     'pending' | 'success' | 'partial' | 'failed'
    recipe?:    ParsedRecipe       // present if status is success or partial
    error?:     string             // present if status is failed
    duplicate?: { recipe_id: string; recipe_title: string }
  }[]
}
```

**Errors:** `404 { error: 'Job not found' }`

---

### `POST /api/import/file`

**Auth:** `withAuth()`

**Body:** `multipart/form-data` — do NOT use `parseBody()`. Use `req.formData()`:
```typescript
const form = await req.formData()
const file = form.get('file') as File
const formatHint = form.get('format') as string | null   // optional override
```

File size: reject files over 10MB (`413`).

**Behavior:**
1. Read file contents into a `Buffer` (via `file.arrayBuffer()`)
2. Auto-detect format via `lib/import/detect-format.ts` (see §6)
3. If `formatHint` is provided, it overrides auto-detection
4. Call the appropriate parser from `lib/import/` (see §6)
5. Run duplicate detection on all parsed results via `lib/import/detect-duplicates.ts`
6. For Notion CSV: additionally return a `notion_mapping` object (LLM-suggested column mapping) — do NOT parse the data yet; wait for user confirmation
7. Return results immediately (no background job)

**Response:** `200`
```typescript
{
  format:          'csv' | 'paprika' | 'plan_to_eat' | 'whisk' | 'notion_csv'
  total:           number
  results:         ImportFileResult[]
  notion_mapping?: Record<string, string>   // only for notion_csv
}

type ImportFileResult = {
  status:     'ready' | 'partial' | 'failed'
  recipe?:    ParsedRecipe
  error?:     string
  duplicate?: { recipe_id: string; recipe_title: string }
}
```

**Errors:**
- `400 { error: 'No file provided' }`
- `400 { error: 'Unsupported file format' }` — if format cannot be detected and no hint given
- `413 { error: 'File too large (max 10MB)' }`
- `500 { error: 'Parse failed' }` — catch-all, log full error server-side

---

### `POST /api/import/confirm-notion-mapping`

**Auth:** `withAuth()`

**Body (JSON):** validated with `parseBody()` against a new schema:
```typescript
export const confirmNotionMappingSchema = z.object({
  file_content: z.string().min(1),   // raw CSV string
  mapping:      z.record(z.string(), z.string()),
})
```

**Behavior:**
1. Parse the CSV string using `lib/import/parse-csv.ts` with the provided `mapping`
2. Run duplicate detection
3. Return results in the same shape as `POST /api/import/file`

**Response:** `200` — same shape as `POST /api/import/file` (without `notion_mapping`)

---

### `POST /api/import/save`

**Auth:** `withAuth()`

**Body (JSON):** validated with `parseBody()` against a new schema:
```typescript
export const importSaveSchema = z.object({
  recipes: z.array(z.object({
    data:              parsedRecipeSchema,   // see §5
    duplicate_action:  z.enum(['skip', 'keep_both', 'replace']).optional(),
    existing_id:       z.string().uuid().optional(),
  })).min(1).max(200),
})
// Refinement: existing_id is required when duplicate_action === 'replace'
```

**Behavior — for each recipe in the array:**

- `duplicate_action === 'skip'`: skip entirely (count as skipped)
- `duplicate_action === 'replace'`: UPDATE the existing recipe in-place (preserve its UUID
  and therefore preserve linked `recipe_history`). Do NOT delete + reinsert, as that would
  orphan cook history. Use `db.from('recipes').update(payload).eq('id', existing_id)`.
  Call `checkOwnership()` first to verify ownership.
- `duplicate_action === 'keep_both'` or undefined: insert as a new recipe
- Any recipe with `status === 'failed'` (no title) must be excluded server-side even if
  somehow included in the request

**Tag handling for each save:**
1. Separate tags into first-class (in `FIRST_CLASS_TAGS`) and unmatched
2. For unmatched tags: upsert into `custom_tags` using `scopeInsert()` (skip if name
   already exists for this user/household — use `ON CONFLICT DO NOTHING` or check first)
3. Include all tags (first-class + custom) in the recipe's `tags` array

**Inserts** use `scopeInsert(user.id, ctx, payload)`.

**Response:** `200`
```typescript
{
  imported:  number
  skipped:   number
  replaced:  number
  failed:    { title: string; error: string }[]
}
```

---

## 5. Shared Types

Add to `types/index.ts`:

```typescript
// A recipe parsed from any import source, before it's saved to the vault
export interface ParsedRecipe {
  title:               string
  category:            'main_dish' | 'breakfast' | 'dessert' | 'side_dish' | null
  ingredients:         string | null
  steps:               string | null
  notes:               string | null
  url:                 string | null
  image_url:           string | null
  prep_time_minutes:   number | null
  cook_time_minutes:   number | null
  total_time_minutes:  number | null
  inactive_time_minutes: number | null
  servings:            number | null
  tags:                string[]          // raw matched tags (may include unmatched)
  source:              'scraped' | 'manual'
}

// A result row in the review table
export interface ImportResult {
  id:         string                              // client-generated uuid for keying rows
  status:     'ready' | 'partial' | 'failed' | 'pending'
  recipe?:    ParsedRecipe
  error?:     string
  source_url?: string                             // for URL imports
  source_label: string                            // e.g. "budgetbytes.com" or "Paprika"
  duplicate?: {
    recipe_id:    string
    recipe_title: string
  }
  duplicate_action?: 'skip' | 'keep_both' | 'replace'
}
```

Add `parsedRecipeSchema` Zod schema to `lib/schemas.ts` mirroring the
`ParsedRecipe` interface above.

---

## 6. Parser Modules (`lib/import/`)

All modules in `lib/import/` are server-only (add `import 'server-only'` at the
top of each file). They must not be imported by any client component.

Each parser returns `ParsedRecipe[]`. Parsers do not run duplicate detection —
that is handled separately by `lib/import/detect-duplicates.ts`.

---

### `lib/import/detect-format.ts`

```typescript
export type ImportFormat =
  | 'url_list'
  | 'csv'
  | 'paprika'
  | 'plan_to_eat'
  | 'whisk'
  | 'notion_csv'

export function detectFormat(file: File): ImportFormat | null
```

Detection rules (in priority order):
1. Extension `.paprikarecipes` → `'paprika'`
2. Extension `.json` → `'whisk'`
3. Extension `.csv` → inspect headers:
   - Contains `Name` + `Source` + `Url` + `Directions` → `'plan_to_eat'`
   - Contains standard recipe columns (`title`/`ingredients`/`steps` or fuzzy matches) → `'csv'`
   - Otherwise → `'notion_csv'`
4. No match → `null`

---

### `lib/import/parse-csv.ts`

```typescript
export function parseCsv(
  content: string,
  mapping?: Record<string, string>,  // column name → recipe field
): ParsedRecipe[]
```

**Column fuzzy matching** (when `mapping` is not provided):

| Recipe field | Accepted CSV column names (case-insensitive) |
|---|---|
| `title` | title, name, recipe name |
| `ingredients` | ingredients, ingredient list |
| `steps` | steps, instructions, directions, method |
| `notes` | notes, description, comments |
| `url` | url, source url, link |
| `tags` | tags, categories, category |
| `category` | category, meal type, type |
| `servings` | servings, serves, yield |
| `prep_time_minutes` | prep time, prep_time, preparation time |
| `cook_time_minutes` | cook time, cook_time, cooking time |
| `total_time_minutes` | total time, total_time |

- Rows with no `title` (after fuzzy mapping): status `'failed'`, include error `'Missing title'`
- Rows with title but missing both `ingredients` and `steps`: status `'partial'`
- Tags column: comma-split, trim each, attempt case-insensitive match against `FIRST_CLASS_TAGS`
- Category column: attempt case-insensitive match to `'main_dish' | 'breakfast' | 'dessert' | 'side_dish'`. If no match: `null`
- Time columns: parse as integer minutes; if value contains "h" or ":" attempt to convert (e.g., "1h 30m" → 90, "1:30" → 90); non-parseable → `null`

---

### `lib/import/parse-plan-to-eat.ts`

```typescript
export function parsePlanToEat(content: string): ParsedRecipe[]
```

Column mapping (fixed, not fuzzy — Plan to Eat format is consistent):

| Plan to Eat column | Recipe field |
|---|---|
| `Name` | `title` |
| `Url` | `url` |
| `Description` | `notes` |
| `Servings` | `servings` (parse int) |
| `PrepTime` | `prep_time_minutes` (parse "X min" → int) |
| `CookTime` | `cook_time_minutes` |
| `TotalTime` | `total_time_minutes` |
| `Ingredients` | `ingredients` |
| `Directions` | `steps` |
| `Notes` | append to `notes` (if both Description and Notes are present, join with `\n\n`) |
| `Tags` | comma-split, match against `FIRST_CLASS_TAGS` |

`source: 'scraped'` if `Url` is non-empty, otherwise `'manual'`.

---

### `lib/import/parse-whisk.ts`

```typescript
export function parseWhisk(content: string): ParsedRecipe[]
```

Parse top-level `recipes` array from JSON. Each entry:

| Whisk field | Recipe field | Notes |
|---|---|---|
| `name` | `title` | |
| `url` | `url` | |
| `ingredients` | `ingredients` | If array of objects: join as `"${quantity} ${unit} ${name}".trim()` per line |
| `instructions` | `steps` | If array of strings: join with `\n`; if array of objects with `text`: extract `text`, join |
| `tags` | `tags` | Match against FIRST_CLASS_TAGS |
| `servings` | `servings` | |
| `prepTime` | `prep_time_minutes` | Parse ISO 8601 duration (see below) |
| `cookTime` | `cook_time_minutes` | |

**ISO 8601 duration parsing** — handle `PT#H#M` and `PT#M` formats:
```typescript
function parseDuration(iso: string): number | null {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!match) return null
  return (parseInt(match[1] ?? '0') * 60) + parseInt(match[2] ?? '0')
}
```

---

### `lib/import/parse-paprika.ts`

```typescript
export async function parsePaprika(buffer: ArrayBuffer): Promise<ParsedRecipe[]>
```

**Must be async** — JSZip operations are async.

The `.paprikarecipes` file is a ZIP archive. Each entry inside is a
gzip-compressed JSON file with a `.paprika` extension.

```typescript
import JSZip from 'jszip'
import { gunzipSync } from 'zlib'  // Node.js built-in

const zip = await JSZip.loadAsync(buffer)
for (const [filename, zipEntry] of Object.entries(zip.files)) {
  if (!filename.endsWith('.paprika')) continue
  const compressed = await zipEntry.async('arraybuffer')
  const json = JSON.parse(gunzipSync(Buffer.from(compressed)).toString('utf8'))
  // map fields
}
```

| Paprika field | Recipe field | Notes |
|---|---|---|
| `name` | `title` | |
| `source` | `url` | |
| `ingredients` | `ingredients` | Already a newline-separated string |
| `directions` | `steps` | Already a newline-separated string |
| `notes` | `notes` | |
| `total_time` | `total_time_minutes` | Parse "45 min" → 45, "1 hr 30 min" → 90 |
| `servings` | `servings` | Parse string → int |
| `categories` | `tags` | Array of strings; match against FIRST_CLASS_TAGS |

`source: 'scraped'` if `source` URL is non-empty, otherwise `'manual'`.

---

### `lib/import/detect-duplicates.ts`

```typescript
export interface DuplicateMatch {
  recipe_id:    string
  recipe_title: string
}

export async function detectDuplicates(
  recipes: ParsedRecipe[],
  db: SupabaseClient,
  userId: string,
  ctx: HouseholdContext | null,
): Promise<Array<DuplicateMatch | null>>
```

Returns a parallel array: one entry per `ParsedRecipe`, `null` if no duplicate found.

**Detection steps (for each recipe):**

1. **URL match** — if `recipe.url` is non-null: query vault for `recipes.url = recipe.url`. If found → definite duplicate (`'exact'`).
2. **Title similarity** — if no URL match: compute Levenshtein distance between `recipe.title` and each vault recipe title. Flag as duplicate if similarity ≥ 80% (i.e., `1 - distance/maxLen >= 0.8`).

Fetch vault titles + IDs once before looping (single query), then run all comparisons in memory.

**Levenshtein implementation:** write a small iterative DP function in the same file —
do not use an npm package for this.

---

### `lib/import/notion-mapping.ts`

```typescript
export async function suggestNotionMapping(
  headers: string[],
  sampleRows: string[][],
): Promise<Record<string, string>>
```

Uses `callLLM()` with `LLM_MODEL_FAST`. System prompt: instruct the LLM to map the
provided CSV column names to recipe fields from this set:
`title | ingredients | steps | notes | url | tags | category | servings | prep_time | cook_time | total_time | (ignore)`.

Pass headers + first 2 data rows as the user message. Parse response with
`parseLLMJsonSafe<Record<string, string>>()`. If parsing fails, return a best-effort
mapping using the same fuzzy rules as `parse-csv.ts`.

---

## 7. UI Components

```
app/(app)/import/
  page.tsx                               — import wizard page (server component)

components/import/
  ImportWizard.tsx                       — client component; owns all wizard state
  ImportSourceTabs.tsx                   — "Paste URLs" / "Upload File" tab selector
  UrlPasteInput.tsx                      — textarea + URL validation + count
  FileUploadZone.tsx                     — drag-drop + format badge + format selector
  ImportProgress.tsx                     — live polling progress view (URL imports only)
  NotionMappingEditor.tsx                — mapping confirmation UI
  ReviewTable.tsx                        — review + select + duplicate actions
  DuplicateActions.tsx                   — per-row keep both / skip / replace picker
  ImportSummary.tsx                      — done screen with stats
```

---

### `app/(app)/import/page.tsx`

Server component. No data fetching. Renders `<ImportWizard />`.
Uses the standard `(app)` layout (AppNav included automatically).

---

### `ImportWizard.tsx`

Client component. Owns all wizard state:

```typescript
type WizardStep = 'source' | 'progress' | 'review' | 'done'

interface WizardState {
  step:          WizardStep
  importMethod:  'urls' | 'file' | null
  jobId:         string | null          // for URL imports
  results:       ImportResult[]
  format:        ImportFormat | null
  notionMapping: Record<string, string> | null
  notionRawCsv:  string | null          // for re-parsing after mapping confirmation
  summary: {
    imported:  number
    skipped:   number
    replaced:  number
    failed:    { title: string; error: string }[]
  } | null
}
```

Step transitions:
- `source` → `progress`: user submits URLs → `POST /api/import/urls` → begin polling
- `source` → `review`: user submits file → `POST /api/import/file` → parse complete
- `source` → `review` (Notion): after `POST /api/import/confirm-notion-mapping`
- `progress` → `review`: polling complete (`completed === total`)
- `review` → `done`: user clicks "Import X recipes" → `POST /api/import/save`

---

### `ImportSourceTabs.tsx`

Props: `{ onUrlsSubmit, onFileSubmit }` (callbacks from `ImportWizard`)

**Tab A — Paste URLs:**
- `<textarea>` with 10,000 char limit
- Live URL counting: scan lines for `http(s)://` prefix; show `"X valid URLs detected"`
- Lines that don't look like URLs: show inline warning `"X lines don't look like URLs — they'll be skipped"`
- "Start Import" button — disabled until at least 1 valid URL detected

**Tab B — Upload File:**
- Drag-and-drop zone: `onDragOver` / `onDrop` handlers, dashed border, `"Drop file here or Browse"`
- `<input type="file" accept=".csv,.json,.paprikarecipes" />`
- After file selected: show filename + auto-detected format badge
- If format undetected: show format selector `<select>` (Generic CSV / Plan to Eat / Whisk / Notion CSV)
- "Start Import" button

---

### `ImportProgress.tsx`

Props:
```typescript
{
  jobId:     string
  getToken:  () => Promise<string>
  onComplete: (results: ImportResult[]) => void
}
```

Polls `GET /api/import/[job_id]` every 2 seconds using `setInterval`.
Clears interval when `completed === total` and calls `onComplete`.

UI:
- Progress bar: `"Importing {completed} of {total} recipes…"`
- Scrollable list of result rows as they come in:
  - ✓ Green: `status === 'success'`
  - ⚠ Yellow: `status === 'partial'`
  - ✗ Red: `status === 'failed'`
  - 🔁 Orange: `duplicate` present
- "Cancel" button: stops polling; calls `onComplete` with results received so far

---

### `NotionMappingEditor.tsx`

Props:
```typescript
{
  headers:     string[]
  mapping:     Record<string, string>
  onConfirm:   (mapping: Record<string, string>) => void
  onCancel:    () => void
}
```

Renders a table: one row per CSV column header. Each row has the column name and
a `<select>` dropdown with the recipe field options + "(ignore)" option. The LLM
mapping is pre-populated as the default value. User can adjust any field.
"Confirm mapping" button calls `onConfirm` with the current selections.

---

### `ReviewTable.tsx`

Props:
```typescript
{
  results:    ImportResult[]
  onChange:   (updated: ImportResult[]) => void  // for duplicate_action updates
  onSave:     (selected: ImportResult[]) => void
  isSaving:   boolean
}
```

**Columns:** Checkbox | Title (editable inline) | Source | Status badge | Tags | Actions

**Status badges:**
- `ready` → green "Ready"
- `partial` → yellow "Partial"
- `failed` → red "Failed" (checkbox disabled)
- `duplicate` (has `duplicate` field + is `ready`/`partial`) → orange "Duplicate"

**Duplicate rows** show: `"Similar to: [recipe_title]"` in muted text below the title.
`<DuplicateActions />` inline below the title for duplicate rows.

**Bulk actions bar above table:**
- "Select all ready" — checks rows with status `ready` and no `duplicate` field
- "Deselect duplicates" — unchecks rows that have `duplicate` field
- "Deselect failed" — unchecks rows with status `failed`

**Footer:**
- `"Import {N} recipes"` primary button (sage) — N reflects checked rows
- `"Cancel"` ghost button → navigates back to `/recipes`

**Inline title editing:** clicking the title switches it to an `<input>`, saves on blur.
Update the `recipe.title` in local state.

---

### `DuplicateActions.tsx`

Props:
```typescript
{
  result:         ImportResult
  onChange:       (action: 'skip' | 'keep_both' | 'replace') => void
}
```

Renders three radio-style buttons or a segmented control:
- **Skip** — don't import this recipe
- **Keep both** — import alongside the existing one
- **Replace** — overwrite existing recipe (shows `"Will replace: [recipe_title]"` confirmation text)

---

### `ImportSummary.tsx`

Props:
```typescript
{
  summary: {
    imported:  number
    skipped:   number
    replaced:  number
    failed:    { title: string; error: string }[]
  }
  partialRecipes: { id: string; title: string }[]   // vault IDs of saved partial recipes
}
```

Layout:
- "Import complete" heading
- Stat grid: ✓ Imported / ⚠ Partial / 🔁 Skipped / ✗ Failed
- If `partialRecipes.length > 0`: "These recipes are missing some data" section with
  "Complete [title] →" links to `/recipes/[id]/edit`
- If `failed.length > 0`: collapsible "Failed recipes" list
- "View your recipes" button → `/recipes`
- "Import more" button → reset `ImportWizard` to step `'source'`

---

## 8. Recipe Box Toolbar — Entry Point

In `app/(app)/recipes/page.tsx` (or `RecipePageContent` component at the toolbar,
around line 413), add an "Import Recipes" button to the toolbar flex container:

```tsx
<Link
  href="/import"
  className="px-4 py-2 rounded text-sm font-medium whitespace-nowrap border border-[#4A7C59] text-[#4A7C59] hover:bg-sage-50 transition-colors"
>
  Import Recipes
</Link>
```

Position: between "Generate with AI" and the right edge, or alongside it. Writer's
call on exact placement within the toolbar's `gap-2` flex row.

---

## 9. Business Logic Rules

1. **URL scraping concurrency** — max 3 concurrent requests. Implement a simple
   semaphore using a counter + queue in the background job runner:
   ```typescript
   let running = 0
   const CONCURRENCY = 3
   async function acquire() {
     while (running >= CONCURRENCY) await new Promise(r => setTimeout(r, 200))
     running++
   }
   function release() { running-- }
   ```

2. **Background scraping + polling** — client polls every 2 seconds. The background
   job calls `POST /api/recipes/scrape` internally (not via HTTP — import the scraper
   function directly if it's extractable, otherwise call the internal logic). After
   each scrape, run duplicate detection for that single result and update the job entry.

3. **In-memory job storage** — use a module-level `Map<string, ImportJob>` in
   `app/api/import/urls/route.ts`. Jobs include: `{ userId, total, completed, results,
   createdAt }`. On each `GET /api/import/[job_id]`, evict jobs older than 30 minutes
   before looking up the requested job.

   > **Serverless warning for Writer:** Module-level state does not persist across
   > serverless function invocations on Vercel. This is accepted for v1 per the brief.
   > In local dev (Node.js server), it works correctly. Document this limitation with
   > a comment in the file.

4. **Paprika parsing is async + server-only** — `parse-paprika.ts` imports `jszip` and
   `zlib` (Node built-in). It must include `import 'server-only'` at the top. The
   JSZip import must not appear in any client bundle.

5. **Notion mapping requires user confirmation** — `POST /api/import/file` returns the
   LLM-suggested mapping but does NOT parse data. Parsing only happens after the user
   confirms (or adjusts) the mapping via `POST /api/import/confirm-notion-mapping`.
   Never auto-apply Notion mapping without showing the editor.

6. **Partial recipes** — has title but missing `ingredients` OR `steps` (not both).
   Save with status `'partial'`. Show in Done summary with edit links.

7. **Failed recipes** — no `title`. Do not save. Show in Done summary with error.

8. **Replace preserves cook history** — use `UPDATE` on the existing recipe row (same
   `id`) rather than DELETE + INSERT. This keeps all `recipe_history` rows intact since
   they FK to `recipes.id`.

9. **Unmatched tags become custom tags** — in `POST /api/import/save`, for each
   unmatched tag string (not in `FIRST_CLASS_TAGS`):
   - Normalize to Title Case
   - Upsert into `custom_tags` via `scopeInsert()` with `section: 'cuisine'` as default
   - Use `ON CONFLICT DO NOTHING` (or equivalent) to avoid duplicates
   - Include the tag name in the recipe's `tags` array

10. **File size limit** — reject files > 10MB in `POST /api/import/file` before
    attempting any parsing.

11. **"Thymeline" references in the brief** — the brief uses the old app name. All UI
    copy, error messages, and comments must use "Forkcast" instead.

---

## 10. Test Cases

All test cases from the brief, mapped to implementation:

| # | Test case | Notes |
|---|---|---|
| T01 | `/import` renders source tabs (URLs / File) | `ImportSourceTabs` renders both tabs |
| T02 | URL textarea validates and counts valid URLs | Live count; non-URL lines show warning |
| T03 | `POST /api/import/urls` returns `job_id` immediately | Returns 202 before scraping completes |
| T04 | `GET /api/import/[job_id]` returns progress with results | Polling returns updated state |
| T05 | Completed URL scrape shows as success in progress view | `status === 'success'` → green row |
| T06 | Failed URL scrape shows as failed with error message | `status === 'failed'` → red row + error |
| T07 | Duplicate URL detected and flagged in results | `duplicate` field populated |
| T08 | File upload zone accepts `.csv`, `.json`, `.paprikarecipes` | `accept` attribute + zone handler |
| T09 | Generic CSV parsed correctly — title/ingredients/steps mapped | Fuzzy column matching |
| T10 | Plan to Eat CSV columns mapped to Forkcast schema | Fixed column mapping |
| T11 | Whisk JSON parsed — ISO duration strings converted to minutes | `PT30M` → 30, `PT1H30M` → 90 |
| T12 | Paprika `.paprikarecipes` file extracted and parsed | JSZip + gzip decompression |
| T13 | Format auto-detected from file extension | `detect-format.ts` |
| T14 | Notion CSV shows LLM mapping for user confirmation | `notion_mapping` returned, editor shown |
| T15 | Notion mapping editor allows column reassignment | `NotionMappingEditor` dropdowns |
| T16 | Title duplicate detected via Levenshtein similarity | ≥80% similarity threshold |
| T17 | Review table shows Ready / Partial / Failed / Duplicate badges | All four badge states |
| T18 | "Select all ready" checks only non-failed, non-duplicate rows | Bulk action logic |
| T19 | "Keep both" saves imported recipe alongside existing | No existing recipe mutation |
| T20 | "Replace" deletes existing recipe and saves new one | UPDATE in-place (preserves id) |
| T21 | "Replace" preserves existing `recipe_history` | UPDATE not DELETE+INSERT |
| T22 | "Skip" deselects duplicate and excludes from save | `duplicate_action === 'skip'` |
| T23 | `POST /api/import/save` returns correct summary counts | All four counter fields |
| T24 | Partial recipe saved with "Complete this recipe" link in summary | Edit link to `/recipes/[id]/edit` |
| T25 | Failed recipe not saved, shown in summary with error | Excluded from inserts |
| T26 | Import summary shows correct counts for all statuses | `ImportSummary` stat grid |
| T27 | "Import Recipes" button visible on Recipe Box toolbar | Link in toolbar flex row |
| T28 | Tags matched against `FIRST_CLASS_TAGS` on import | Case-insensitive matching |
| T29 | Unmatched tags saved as custom tags | Upsert to `custom_tags` table |
| T30 | Job expires after 30 minutes | Eviction on GET lookup |

---

## 11. Out of Scope

Matches brief exactly:
- Notion API OAuth (direct connection without CSV export)
- Scheduled/recurring imports
- Import history log
- Exporting from Forkcast (reverse direction)
- Importing meal plans or grocery lists
- Importing cook history / recipe log dates
- Real-time sync with external apps
- Import from Instagram, Pinterest, or YouTube

---

Awaiting owner approval before Writer proceeds.
