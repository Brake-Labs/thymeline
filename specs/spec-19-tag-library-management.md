# Spec 19 — Tag Library Management in Preferences

**Status:** Approved — Writer may proceed
**Branch:** `feature/tag-library-management` (cut from `staging`)

---

## Summary

Add a Tag Library section to the Settings → Preferences page where users can add new tags, rename existing custom tags, and delete any tag. First-class tags (hardcoded in `lib/tags.ts`) can be hidden per-user. Custom tags can be deleted and renamed. A new `hidden_tags` column on `user_preferences` stores the user's hidden first-class tags.

---

## Current state (Writer must read before touching anything)

There is already a "Your Tags" `SectionCard` in `components/preferences/PreferencesForm.tsx` at **lines 341–406**. It renders custom tags as pills with delete-with-confirmation. It owns local state `localCustomTags`, `deleteConfirm`, `deleteError` and handlers `handleDeleteTagClick`, `handleDeleteTagConfirm`. **This section is replaced entirely by the new `TagLibrarySection` component.** The Writer must remove these lines and migrate their state and handlers into `TagLibrarySection` rather than duplicating them.

`GET /api/tags` returns `{ firstClass: string[], custom: { name, section }[] }` with no counts. `app/api/tags/[tag_name]/route.ts` exports `GET` and `DELETE`; the param is read as `params?.tag_name`. `PreferencesPageContent` already fetches tags and passes `firstClassTags: string[]` and `customTags: { name, section }[]` to `PreferencesForm`.

---

## DB changes

**Migration:** `supabase/migrations/0NN_hidden_tags.sql`

Do not assume the next available number. List `supabase/migrations/` and use the next number in sequence.

```sql
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS hidden_tags text[] DEFAULT '{}';
```

No other schema changes. The `custom_tags` table is unchanged.

Also add `hidden_tags: string[]` to `database.ts` generated types manually if the type generator is not re-run.

---

## Files changed — complete list

| File | Change |
|---|---|
| `supabase/migrations/0NN_hidden_tags.sql` | New file — ALTER TABLE above |
| `types/index.ts` | Add `hidden_tags: string[]` to `UserPreferences` interface (after `meal_context` on line 31) |
| `lib/schemas.ts` | Add `hidden_tags: z.array(z.string()).optional()` to `updatePreferencesSchema` (around lines 167–179) |
| `app/api/preferences/route.ts` | (1) Add `hidden_tags: [] as string[]` to `DEFAULT_PREFS`. (2) Add `'hidden_tags'` to the allowed array (line 74). (3) Add `hidden_tags` to the `.select(...)` string in GET. GET `/api/preferences` then returns `hidden_tags` automatically. |
| `app/api/tags/[tag_name]/route.ts` | Add `PATCH` export alongside existing `GET` and `DELETE` |
| `app/api/tags/route.ts` | Extend GET response shape (see API changes below) |
| `app/(app)/settings/preferences/PreferencesPageContent.tsx` | Update type annotation and extract `hiddenTags` from tags response (see below) |
| `components/preferences/PreferencesForm.tsx` | Remove lines 341–406 (existing Your Tags section). Add `hiddenTags: string[]` to `PreferencesFormProps`. Render `<TagLibrarySection>` in place of the removed section, threading `getToken`. |
| `components/preferences/TagLibrarySection.tsx` | New component (see UI section) |
| `components/preferences/TagRow.tsx` | New component (see UI section) |

---

## API changes

### GET /api/tags — add recipe counts, filter hidden first-class tags

Fetch `hidden_tags` from `user_preferences` **first**, before any other logic. Use two-step `scopeQuery` and `.maybeSingle()` — a new user has no preferences row:

```typescript
let prefsQ = db.from('user_preferences').select('hidden_tags')
prefsQ = scopeQuery(prefsQ, user.id, ctx)
const { data: prefs } = await prefsQ.maybeSingle()
const hiddenSet = new Set((prefs?.hidden_tags ?? []).map((t: string) => t.toLowerCase()))
```

Then fetch all recipe rows in scope and build a count map with null-safe iteration:

```typescript
let recipesQ = db.from('recipes').select('tags')
recipesQ = scopeQuery(recipesQ, user.id, ctx)
const { data: recipes } = await recipesQ

const counts = new Map<string, number>()
for (const row of recipes ?? []) {
  for (const tag of (row.tags as string[] | null) ?? []) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
}
```

Build the response:
- `firstClass`: `FIRST_CLASS_TAGS.filter((t) => !hiddenSet.has(t.toLowerCase()))` annotated with counts
- `hidden`: `FIRST_CLASS_TAGS.filter((t) => hiddenSet.has(t.toLowerCase())).map((name) => ({ name }))` — preserves canonical casing from the constant
- `custom`: custom tags from `custom_tags` each annotated with counts

New response shape:

```typescript
{
  firstClass: { name: string; recipe_count: number }[]   // hidden ones omitted
  custom:     { name: string; section: string; recipe_count: number }[]
  hidden:     { name: string }[]                         // hidden first-class, for Restore UI
}
```

Do not use raw SQL. Use the Supabase JS client throughout.

---

### PATCH /api/tags/:tag_name — rename a custom tag (new export in `app/api/tags/[tag_name]/route.ts`)

Param: `params?.tag_name` (same as existing GET and DELETE).
Request body: `{ name: string }` (the new name).

Logic:
1. Member-role guard: `if (ctx && ctx.role === 'member') return 403`. Solo users (`ctx === null`) proceed normally.
2. `tagName = decodeURIComponent(params?.tag_name)`
3. Verify tag exists in `custom_tags` for this scope (same pattern as DELETE lines 31–33). Return 404 if not found.
4. Normalize new name (title-case, same as POST `/api/tags`).
5. Check new name not already taken in `custom_tags` for this scope (case-insensitive). Return 409 if duplicate.
6. Check new name does not match a `FIRST_CLASS_TAGS` entry (case-insensitive). Return 400 if so.
7. Update `custom_tags.name`.
8. Update all affected recipes using the JS loop pattern from the existing DELETE handler (lines 39–51):

```typescript
let recipesQ = db.from('recipes').select('id, tags').contains('tags', [tagName])
recipesQ = scopeQuery(recipesQ, user.id, ctx)
const { data: affected } = await recipesQ

for (const recipe of affected ?? []) {
  const newTags = (recipe.tags as string[]).map((t) =>
    t.toLowerCase() === tagName.toLowerCase() ? newName : t
  )
  await db.from('recipes').update({ tags: newTags }).eq('id', recipe.id)
}
```

Return `{ name: newName, section }` with 200.

---

### DELETE /api/tags/:tag_name — extend to handle first-class tags

Add a branch **before** the existing custom-tag logic. Use two-step `scopeQuery`, `.maybeSingle()`, and `upsert` (so the write is safe even if no preferences row exists yet):

```typescript
const isFirstClass = FIRST_CLASS_TAGS.some(
  (t) => t.toLowerCase() === tagName.toLowerCase()
)
if (isFirstClass) {
  let prefsQ = db.from('user_preferences').select('hidden_tags')
  prefsQ = scopeQuery(prefsQ, user.id, ctx)
  const { data: prefs } = await prefsQ.maybeSingle()   // null for new users — not an error
  const current: string[] = prefs?.hidden_tags ?? []

  if (!current.map((t) => t.toLowerCase()).includes(tagName.toLowerCase())) {
    const payload = scopeInsert(user.id, ctx, { hidden_tags: [...current, tagName] })
    const onConflict = ctx ? 'household_id' : 'user_id'
    await db.from('user_preferences').upsert(payload, { onConflict })
  }
  return new NextResponse(null, { status: 204 })
}
// ... existing custom tag deletion logic unchanged
```

Does **not** strip the tag from recipes (hiding is a library preference, not a data purge).

> Note: `upsert` here relies on DB column defaults for non-specified fields (e.g. `options_per_day`, `seasonal_mode`). If a constraint violation appears in testing, include the `DEFAULT_PREFS` fields in the payload as a base.

---

### Restore (un-hide) a first-class tag — PATCH /api/preferences

Use the existing `PATCH /api/preferences` endpoint with `{ hidden_tags: [...updatedArray] }` (remove the restored tag from the array). `hidden_tags` is now in the allowed list and schema. No new endpoint needed.

---

## PreferencesPageContent — single source for hidden tags

`PreferencesPageContent` already fetches `GET /api/tags`. The `hidden` array in that response is the authoritative source. **Do not** add a second fetch to `GET /api/preferences` for `hidden_tags` — two fetches can drift out of sync.

Extract `hiddenTags` directly from the tags response:

```typescript
const data: {
  firstClass: { name: string; recipe_count: number }[]
  custom:     { name: string; section: string; recipe_count: number }[]
  hidden:     { name: string }[]
} = await r.json()

setFirstClassTags(data.firstClass ?? [])
setCustomTags(data.custom ?? [])
setHiddenTags(data.hidden ?? [])   // new state — passed to PreferencesForm → TagLibrarySection
```

---

## UI — TagLibrarySection component

Replaces the existing `SectionCard` at `PreferencesForm.tsx` lines 341–406. Receives initial data as props (already fetched by `PreferencesPageContent`); manages its own local state for optimistic updates.

**Props:**

```typescript
interface TagLibrarySectionProps {
  firstClassTags: { name: string; recipe_count: number }[]
  customTags:     { name: string; section: string; recipe_count: number }[]
  hiddenTags:     { name: string }[]
  getToken:       () => Promise<string> | string   // thread from PreferencesForm's existing prop
}
```

**Layout (within a SectionCard):**

```
Tag library

[Add a tag…]  [Add]

Built-in tags
  Quick          12 recipes   [Hide]
  Gluten-Free     4 recipes   [Hide]
  ···

Your tags
  Weeknight       8 recipes   [Rename] [Delete]
  Date Night      2 recipes   [Rename] [Delete]

Hidden tags                            ← only shown if hiddenTags.length > 0
  Keto            –                    [Restore]
```

**Interactions:**

- **Add:** text input → `POST /api/tags` → optimistically appends to Your tags. Client-side: reject empty or duplicate (case-insensitive). Show API error inline if rejected.
- **Hide (first-class):** `DELETE /api/tags/:tag_name` (new branch) → moves row from Built-in to Hidden section. No confirmation (reversible).
- **Restore (hidden):** `PATCH /api/preferences` with updated `hidden_tags` array (tag removed) → moves row back to Built-in. Optimistic update, roll back on error.
- **Rename (custom only):** `[Rename]` → tag name becomes an inline `<input>` with `[Save]` / `[Cancel]`. `PATCH /api/tags/:tag_name` on save. Optimistic update, roll back on error. Disable Save if input is empty or unchanged.
- **Delete (custom only):** `[Delete]` → inline confirmation: "Remove from X recipes? [Delete] [Cancel]". `DELETE /api/tags/:tag_name` on confirm. Migrated from the removed PreferencesForm section — same UX, same copy.

**Member-role:** when `ctx.role === 'member'`, Hide, Rename, and Delete buttons are absent. The list is read-only. (The component receives `getToken` and makes API calls; it should also receive or derive the current role to conditionally render action buttons. Alternatively, rely on API 403s and show an inline error — whichever matches the pattern used elsewhere in PreferencesForm.)

---

## TagRow component

Renders one tag row with count and action buttons. Handles inline rename state (local `isRenaming` boolean, `renameValue` string). Receives its action handlers as props from `TagLibrarySection`.

---

## Test cases

| # | Test |
|---|---|
| 1 | Tag library loads with recipe counts for built-in and custom tags |
| 2 | Hidden tags appear in the Hidden section, not the Built-in section |
| 3 | Adding a new tag appends it to Your tags |
| 4 | Adding a duplicate name shows an error and does not create |
| 5 | Renaming a custom tag updates in place; old name no longer appears |
| 6 | Renaming to an already-existing name is rejected with a clear error |
| 7 | Renaming to a first-class tag name is rejected with a clear error |
| 8 | Deleting a custom tag confirmation shows the correct recipe count |
| 9 | Deleting a custom tag removes it from the list |
| 10 | Hiding a first-class tag moves it to Hidden; recipe data is unchanged |
| 11 | Restoring a hidden tag moves it back to Built-in |
| 12 | Member-role user: Hide, Rename, and Delete buttons are absent; list is read-only |
| 13 | GET /api/preferences returns `hidden_tags` field |
| 14 | PATCH /api/preferences with updated `hidden_tags` persists correctly |

---

## Out of scope

- Filtering hidden tags out of the tag picker (`TagSelector`) — requires threading `hidden_tags` through every recipe form; deferred to a follow-up
- Renaming first-class tags (hide + add custom with preferred name is the workaround)
- Merging two tags into one
- Bulk auto-tagging recipes
- Tag ordering, colors, or icons
- Stripping hidden first-class tags from existing recipe data
