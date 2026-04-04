# Spec 06 — Tags UI

**Status:** Final — Awaiting owner approval before Writer proceeds.
**Branch:** `feature/tags-ui` from `staging`
**Depends on:** `feature/scaffold`, `feature/recipe-vault` merged to `staging`

---

> **Corrections to prior specs — `user_tags` replaced by `custom_tags`:**
> Spec-01 created a `user_tags` table. Spec-06 replaces it with `custom_tags`
> (same structure, new name) and introduces hardcoded first-class tags.
> The migration in §8a drops `user_tags`. All tag validation in prior specs
> that references `user_tags` must be updated:
> - **Spec-02** (`POST /api/recipes`, `PATCH /api/recipes/[id]`): validate tags
>   against the first-class list + `custom_tags`, not `user_tags`.
> - **Spec-03** (`PATCH /api/preferences`): validate `preferred_tags`,
>   `avoided_tags`, `limited_tags[].tag` against first-class list + `custom_tags`.
> - **Spec-05** (setup screen tag pickers): `GET /api/tags` callers should use
>   the new `{ firstClass, custom }` shape; derive a flat list as
>   `[...firstClass, ...custom]` where backward-compatible logic requires it.

> **`GET /api/tags` response shape change:**
> Spec-02 defined this as `UserTag[]` (`{ id, name }`). Spec-06 redefines it as
> `{ firstClass: string[], custom: string[] }` — no IDs, flat strings, two groups.
> The `TagSelector` needs both groups to render them separately.
> All existing callers (specs 02, 03, 05) must switch to the new shape.
> The `UserTag` interface in `types/index.ts` can be removed.

---

## Overview

Add tag support across the recipe experience: LLM-suggested tags (pre-checked)
in the Add Recipe URL flow, manual tag selection in the Manual tab and Edit
recipe form, tag chips on recipe list rows, and tag filtering in the recipe list
view. Users can create custom tags inline. The LLM may suggest new tags not yet
in the user's library; the user must confirm before they are created.

---

## 1. Tag Taxonomy

### 1a. First-class tags (hardcoded in the application)

Two groups, always shown in `TagSelector`. Defined as a constant in
`lib/tags.ts` (see §8b) — never stored in the database.

**Style/Dietary:**
`Seafood`, `Vegetarian`, `Gluten-Free`, `Garden`, `Slow Cooker`, `Sheet Pan`,
`One Pot`, `Quick`, `Favorite`, `Sourdough`, `Healthy`, `Comfort`, `Spicy`,
`Entertain`, `Soup`, `Hungarian`, `Pizza`, `Grill`, `Autumn`, `Winter`,
`Summer`, `Mediterranean`

**Protein:**
`Chicken`, `Beef`, `Pork`, `Sausage`, `Lamb`, `Turkey`, `Shrimp`, `Salmon`,
`Fish`, `Tofu`, `Tempeh`, `Seitan`, `Beans`, `Lentils`, `Chickpeas`, `Eggs`

### 1b. Custom tags (user-created)

- Stored in `custom_tags` table (see §8a)
- Scoped per user — never shared across accounts
- Shown in `TagSelector` after first-class tags, as a third group
- Created inline via the `+` chip in `TagSelector`

---

## 2. Tag Selector Component

**`components/recipes/TagSelector.tsx`** — reusable, used in all form contexts.

### Props

```typescript
interface TagSelectorProps {
  selected:     string[]
  suggested?:   string[]  // pre-checked with sparkle; become normal on interaction
  pendingNew?:  string[]  // LLM-suggested tags not yet in any library
  onChange:     (tags: string[]) => void
  onCreateTag?: (tag: string) => void  // fires after a new tag is successfully created
}
```

### Internal behavior

The component fetches its own tag pool on mount via `GET /api/tags`. It manages
a local `customTags: string[]` state initialised from the API response.
First-class tags come from the `FIRST_CLASS_TAGS` constant in `lib/tags.ts` —
no fetch needed for those.

When a new custom tag is created (via `+` chip or `pendingNew` confirmation),
the component calls `POST /api/tags` internally. On success it adds the tag to
local `customTags`, selects it, and fires `onCreateTag(name)` to notify the
parent. The parent does not call the API itself — `onCreateTag` is a
post-success notification only.

If `onCreateTag` is not provided, the `+` chip and `pendingNew` confirmation
still work; the parent receives no notification beyond the updated `selected`
array via `onChange`.

### Layout

Chips rendered in three sections, in order:
1. **Style/Dietary** first-class tags
2. **Protein** first-class tags
3. **Custom tags** (may be empty)

At the very end: a `+` chip (always last).

**Chip visual states:**

| State | Style |
|---|---|
| Unselected | `border border-stone-300 text-stone-600 bg-white` |
| Selected | `bg-stone-800 text-white border-stone-800` |
| Suggested (exists in pool) | Selected style + small `✦` sparkle in top-right corner; becomes a plain selected chip on any interaction |
| Pending-new (not in pool) | `bg-amber-50 border-dashed border-amber-400 text-amber-800` + `✦` sparkle |

### `+` chip — inline create

- Tap `+` → expands to an inline `<input>` in-place
- **Case-insensitive dedup**: before creating, check the typed name against
  `[...FIRST_CLASS_TAGS, ...customTags]` (case-insensitive). If a match exists,
  select the canonical existing tag instead of creating. Show a brief inline
  hint: `"'X' already exists — selected it for you."`
- On Enter or confirm button tap: call `POST /api/tags`, update `customTags`,
  select the new tag, fire `onCreateTag`
- Dismiss: Escape key or tap outside the input field (no creation)

### Pending-new chip — confirm/dismiss

- Each `pendingNew` chip renders a `×` button on its right edge
- **Tap chip body**: create the tag (`POST /api/tags`), move it from
  `pendingNew` into `selected`, fire `onCreateTag`
- **Tap `×`**: remove the chip from `pendingNew` immediately, no creation,
  no confirmation needed

---

## 3. From URL Tab — LLM Tag Suggestion

### 3a. Scrape API changes

**File:** `app/api/recipes/scrape/route.ts`

Add to the LLM extraction prompt:

```
- "suggestedTags": array of strings. Suggest relevant tags for this recipe.
  Prioritize tags from this list: [full FIRST_CLASS_TAGS list].
  You may suggest additional tags not on the list (e.g. cuisine, technique)
  if clearly relevant. Keep total suggestions to 6 or fewer.
  Never suggest protein tags that don't apply to this recipe.
```

**Server-side processing after LLM returns:**
1. Fetch the user's `custom_tags` rows.
2. Build the full known pool: `[...FIRST_CLASS_TAGS, ...userCustomTags]`
   (compare case-insensitively).
3. Split `suggestedTags` into:
   - **`suggestedTags`**: LLM tags that match the known pool — use the
     canonical casing from the pool (not the LLM's casing)
   - **`suggestedNewTags`**: LLM tags that don't match anything — normalize
     to Title Case before returning
4. `partial` flag is unchanged — absent tag suggestions do not count as partial.

**Updated scrape response:**
```typescript
{
  title:            string | null
  ingredients:      string | null
  steps:            string | null
  imageUrl:         string | null
  sourceUrl:        string
  partial:          boolean
  suggestedTags:    string[]   // matched, canonical casing
  suggestedNewTags: string[]   // unmatched, Title Case normalized
}
```

### 3b. Add Recipe modal — From URL tab

- Pass `suggested={suggestedTags}` and `pendingNew={suggestedNewTags}` to
  `<TagSelector />`
- User can uncheck suggested tags, confirm or dismiss pending-new chips, or
  add others freely
- Final `selected` tags (including any confirmed new ones) are saved with the
  recipe

---

## 4. Manual Tab — Tag Selection

- Render `<TagSelector selected={[]} />` with no `suggested` or `pendingNew`
- User picks tags freely; can create custom tags via `+` chip
- No LLM involvement

---

## 5. Edit Recipe

- Add `<TagSelector />` to the edit form at `app/(app)/recipes/[id]/edit/`
- Initialise `selected` from the recipe's current tags
- On submit: save the updated `selected` tags

---

## 6. Recipe List View

### 6a. Tag chips on recipe rows

- Each row shows up to 3 tag chips (reuse `TagPill` from spec-02)
- If tags > 3: show `+N more` in muted text
- Chips are read-only in this context

### 6b. Tag filter bar

**`components/recipes/TagFilterBar.tsx`**

- Horizontally scrollable bar above the recipe list
- Populated dynamically from the fetched recipe list: show only tags that
  appear on at least one recipe in the vault. No separate API call — derive
  from the recipe data already in component state.
- If the vault has no recipes (or no tags), render nothing (hide the bar)
- Selecting a tag adds it to the active filter set; multiple tags use
  **AND** logic (recipe must have all selected tags)
- Active filter chips: filled style
- A **"Clear"** button appears at the left of the bar when any filter is active
- Filter state is local React state — not persisted

---

## 7. Tab Persistence (Add Recipe Modal)

- Switching between "From URL" and "Manual" tabs preserves scraped field values
  and current tag selection
- State clears only when the modal is closed (× button or backdrop click)

---

## 8. Data Layer

### 8a. Migration

**File:** `supabase/migrations/006_custom_tags.sql`

```sql
-- Drop user_tags (introduced in migration 001).
-- custom_tags replaces it entirely.
drop table if exists user_tags;

create table custom_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

alter table custom_tags enable row level security;

create policy "Users manage own custom tags"
  on custom_tags for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

> **Casing note:** `unique(user_id, name)` is case-sensitive in Postgres.
> Case-insensitive deduplication is enforced at the application layer
> (`TagSelector` and `POST /api/tags`). The DB constraint is a last-resort
> guard only.

### 8b. New constant file

**`lib/tags.ts`** — single source of truth for first-class tags.

```typescript
export const STYLE_DIETARY_TAGS = [
  'Seafood', 'Vegetarian', 'Gluten-Free', 'Garden', 'Slow Cooker',
  'Sheet Pan', 'One Pot', 'Quick', 'Favorite', 'Sourdough', 'Healthy',
  'Comfort', 'Spicy', 'Entertain', 'Soup', 'Hungarian', 'Pizza', 'Grill',
  'Autumn', 'Winter', 'Summer', 'Mediterranean',
] as const

export const PROTEIN_TAGS = [
  'Chicken', 'Beef', 'Pork', 'Sausage', 'Lamb', 'Turkey', 'Shrimp',
  'Salmon', 'Fish', 'Tofu', 'Tempeh', 'Seitan', 'Beans', 'Lentils',
  'Chickpeas', 'Eggs',
] as const

export const FIRST_CLASS_TAGS: string[] = [
  ...STYLE_DIETARY_TAGS,
  ...PROTEIN_TAGS,
]
```

Import `FIRST_CLASS_TAGS` everywhere tag validation or LLM prompts need the
full list (scrape route, recipe create/update, preferences API).

### 8c. API routes

**`GET /api/tags`** — updated shape (replaces spec-02 definition)

```typescript
// Response
{
  firstClass: string[]  // always the full FIRST_CLASS_TAGS constant
  custom:     string[]  // user's custom_tags, sorted by created_at asc
}
```

Callers that need a flat list: `[...firstClass, ...custom]`.

---

**`POST /api/tags`** — create a new custom tag

Input: `{ name: string }`

Behavior:
1. Trim whitespace; normalize to Title Case.
2. Check case-insensitively against `FIRST_CLASS_TAGS`. If match:
   return `400 "'{name}' is a built-in tag and cannot be added as a custom tag."`.
3. Check case-insensitively against user's existing `custom_tags`. If match:
   return `409`.
4. Insert into `custom_tags`. Return `{ id: string, name: string }`.

---

**`POST /api/recipes` and `PATCH /api/recipes/[id]`** — tag validation
(supersedes spec-02)

Validate each submitted tag case-insensitively against
`[...FIRST_CLASS_TAGS, ...userCustomTags]`. Return `400` listing unknown tags.
This replaces the prior `user_tags` check from spec-02.

---

## 9. Component and File Structure

```
lib/tags.ts                                  — FIRST_CLASS_TAGS constant (new)
components/recipes/TagSelector.tsx           — reusable chip selector (new)
components/recipes/TagFilterBar.tsx          — filter bar for list view (new)
components/recipes/TagPill.tsx               — existing; no changes needed
app/(app)/recipes/page.tsx                   — wire TagFilterBar + filtering
app/(app)/recipes/add/                       — update modal tabs + scrape flow
app/(app)/recipes/[id]/edit/                 — update edit form
app/api/recipes/scrape/route.ts              — add suggestedTags + suggestedNewTags
app/api/recipes/route.ts                     — update tag validation (custom_tags)
app/api/recipes/[id]/route.ts                — update tag validation (custom_tags)
app/api/tags/route.ts                        — update GET shape; add POST handler
supabase/migrations/006_custom_tags.sql      — drop user_tags, create custom_tags
```

---

## 10. Test Cases

| ID | Description |
|----|-------------|
| T01 | Scrape returns `suggestedTags` (matched, canonical casing) and `suggestedNewTags` (unmatched, Title Case) |
| T02 | `suggestedTags` appear pre-checked with sparkle indicator |
| T03 | `suggestedNewTags` appear as pending-new chips with dashed amber border |
| T04 | Tapping a pending-new chip body creates it in `custom_tags` and selects it |
| T05 | Tapping `×` on a pending-new chip removes it without creating |
| T06 | User can uncheck a suggested tag |
| T07 | User can select any existing first-class or custom tag manually |
| T08 | `+` chip expands to inline text input |
| T09 | Typing a name that matches an existing tag (case-insensitive) selects it instead of creating |
| T10 | Creating a new tag via `+` chip adds it to `custom_tags` and selects it |
| T11 | New custom tag appears in `TagSelector` on a subsequent recipe add/edit |
| T12 | `POST /api/tags` returns `400` when name matches a first-class tag |
| T13 | `POST /api/tags` returns `409` for a duplicate custom tag name |
| T14 | `POST /api/recipes` rejects an unknown tag with `400` |
| T14b | `PATCH /api/recipes/[id]` rejects an unknown tag with `400` |
| T15 | Manual tab renders `TagSelector` with no pre-checked tags |
| T16 | Switching URL→Manual→URL preserves scraped data and tag selection |
| T17 | Modal close clears all tag and field state |
| T18 | Edit form loads current recipe tags as `selected` |
| T19 | Edit form saves updated tags on submit |
| T20 | Recipe list row shows up to 3 tag chips |
| T21 | Recipe list row shows `+N more` when tags exceed 3 |
| T22 | Tag filter bar shows only tags present on at least one recipe in the vault |
| T23 | Tag filter bar is empty (hidden) when the vault has no tagged recipes |
| T24 | Selecting a tag filters the recipe list |
| T25 | Selecting multiple tags uses AND logic |
| T26 | "Clear" button resets all active filters |
| T27 | `GET /api/tags` returns `{ firstClass, custom }` with correct contents for the current user |

---

## 11. Out of Scope

- Tag autocomplete/search within the selector
- Deleting or renaming custom tags
- Tag-based sorting
- Persisted filter state across sessions

---

*Awaiting owner approval before Writer proceeds.*
