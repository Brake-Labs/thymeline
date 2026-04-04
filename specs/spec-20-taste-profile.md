# Spec 20 — User Taste Profile

**Brief:** `briefs/brief-20-taste-profile.md`
**Branch:** `feature/taste-profile` (cut from `staging`)
**Status:** Approved — Writer may proceed

---

## 1. Summary

Build a lightweight taste profile system that learns what the user actually cooks, injects that knowledge into Help Me Plan, and adds a "Make Again?" prompt after every recipe log. Three concrete changes:

1. **`make_again` flag** — a new boolean column on `recipe_history`, set via a non-blocking prompt after logging
2. **`lib/taste-profile.ts`** — a server-side module that derives a structured `TasteProfile` from history and preferences at query time (no caching)
3. **Help Me Plan injection** — `POST /api/plan/suggest` derives the profile, pre-filters disliked recipes, boosts loved ones, and injects the profile into the LLM system message
4. **`meal_context` UI expansion** — richer label, placeholder, and helper text; character limit raised to 2000

---

## 2. Migration numbers

Current highest migration: `024_hidden_tags.sql`. The brief references 024 and 025 but those are now taken. Use:
- `025_recipe_history_make_again.sql`
- `026_meal_context_length.sql`

```sql
-- 025_recipe_history_make_again.sql
ALTER TABLE recipe_history
  ADD COLUMN IF NOT EXISTS make_again boolean;
  -- null = not answered, true = make again, false = not for us

-- 026_meal_context_length.sql
ALTER TABLE user_preferences
  ALTER COLUMN meal_context TYPE text;
  -- text in Postgres is unlimited; this removes any varchar constraint
```

---

## 3. Files changed — complete list

| File | Change |
|---|---|
| `supabase/migrations/025_recipe_history_make_again.sql` | New |
| `supabase/migrations/026_meal_context_length.sql` | New |
| `types/database.ts` | Add `make_again: boolean \| null` to `recipe_history` Row / Insert / Update |
| `types/index.ts` | Add `RecipeHistoryEntry`, `CookingFrequency`, `TasteProfile` (see §4) |
| `lib/schemas.ts` | Update `logRecipeSchema`; add `patchLogSchema` |
| `app/api/recipes/[id]/log/route.ts` | POST: accept `make_again`; return `entry_id`; fetch existing ID on already-logged |
| `app/api/recipes/[id]/log/[entry_id]/route.ts` | New — PATCH `make_again` on existing entry |
| `lib/taste-profile.ts` | New server-only module |
| `app/api/plan/helpers.ts` | Update `buildSystemMessage()` to accept optional `TasteProfile`; add `buildTasteProfileSection()` |
| `app/api/plan/suggest/route.ts` | Derive profile, pre-filter disliked, boost loved, inject into system message |
| `components/recipes/MakeAgainPrompt.tsx` | New shared component |
| `app/(app)/recipes/[id]/page.tsx` | Show `MakeAgainPrompt` after log success; update POST response type |
| `app/(cook)/recipes/[id]/cook/page.tsx` | Show `MakeAgainPrompt` on final step after log success; update POST response type |
| `app/(app)/plan/[week_start]/page.tsx` | Show `MakeAgainPrompt` after logging from the plan week view (see §8) |
| `components/preferences/PreferencesForm.tsx` | Update `meal_context` label, placeholder, helper text, and char limit |

---

## 4. Types (`types/index.ts`)

Add after existing interfaces:

```typescript
export interface RecipeHistoryEntry {
  id:         string
  recipe_id:  string
  user_id:    string
  made_on:    string
  make_again: boolean | null
}

export type CookingFrequency = 'light' | 'moderate' | 'frequent'

export interface TasteProfile {
  loved_recipe_ids:    string[]
  disliked_recipe_ids: string[]
  top_tags:            string[]
  avoided_tags:        string[]
  preferred_tags:      string[]
  meal_context:        string | null
  cooking_frequency:   CookingFrequency
  recent_recipes:      { recipe_id: string; title: string; made_on: string }[]
}
```

---

## 5. Schema changes (`lib/schemas.ts`)

Update `logRecipeSchema` (line 56):

```typescript
export const logRecipeSchema = z.object({
  made_on:    dateString.optional(),
  make_again: z.boolean().optional(),
})
```

Add new schema after the existing log schemas:

```typescript
export const patchLogSchema = z.object({
  make_again: z.boolean(),
})
```

---

## 6. API changes

### `POST /api/recipes/[id]/log/route.ts` — extend

**File:** `app/api/recipes/[id]/log/route.ts`

Three changes:

**1. Accept `make_again` from body.** `parseBody` already returns `body?.make_again` once the schema is updated.

**2. Return `entry_id` in the response.** The `MakeAgainPrompt` needs the history row's ID to call PATCH. Modify the insert to return the ID, and add a fallback fetch for the already-logged case:

```typescript
const { data: inserted, error: insertError } = await db
  .from('recipe_history')
  .insert({ recipe_id: id, user_id: user.id, made_on: madeOn })
  .select('id')
  .single()

const alreadyLogged =
  insertError !== null &&
  (insertError.code === '23505' || insertError.message.includes('recipe_history_unique_day'))

if (insertError && !alreadyLogged) {
  return NextResponse.json({ error: insertError.message }, { status: 500 })
}

let entryId: string | null = inserted?.id ?? null
if (alreadyLogged) {
  const { data: existing } = await db
    .from('recipe_history')
    .select('id')
    .eq('recipe_id', id)
    .eq('user_id', user.id)
    .eq('made_on', madeOn)
    .single()
  entryId = existing?.id ?? null
}
```

**3. If `make_again` is included in the body**, save it immediately on the just-inserted (or existing) entry:

```typescript
if (body?.make_again !== undefined && entryId) {
  await db
    .from('recipe_history')
    .update({ make_again: body.make_again })
    .eq('id', entryId)
}
```

Updated response:

```typescript
return NextResponse.json({
  made_on:      madeOn,
  already_logged: alreadyLogged,
  entry_id:     entryId,
})
```

The pantry deduction (lines 37, 45–88) is **unchanged**.

---

### `PATCH /api/recipes/[id]/log/[entry_id]/route.ts` — new file

Allows updating `make_again` on an existing history entry after the initial log.

```typescript
export const PATCH = withAuth(async (req, { user, db }, params) => {
  const recipeId = params.id!
  const entryId  = params.entry_id!

  const { data: body, error } = await parseBody(req, patchLogSchema)
  if (error) return error

  // Verify the entry belongs to this user and matches the recipe
  const { data: entry } = await db
    .from('recipe_history')
    .select('id')
    .eq('id', entryId)
    .eq('recipe_id', recipeId)
    .eq('user_id', user.id)
    .single()

  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db
    .from('recipe_history')
    .update({ make_again: body.make_again })
    .eq('id', entryId)

  return NextResponse.json({ id: entryId, make_again: body.make_again })
})
```

Errors: `400` (invalid body), `404` (entry not found or not owned). No 403 — the `.eq('user_id', user.id)` check covers ownership.

Note: the route file is `[entry_id]/route.ts` — params are `params.id` (recipe) and `params.entry_id` (history row).

---

## 7. `lib/taste-profile.ts` — new server-only file

**Important:** this module imports `SupabaseClient` and performs DB queries. It must not be imported by client components. Mark it with `'server-only'` or ensure it is only ever imported from API routes or server utilities.

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { TasteProfile, CookingFrequency, HouseholdContext } from '@/types'

export const IMPLICIT_LOVE_THRESHOLD = 3   // configurable constant per brief
```

### Function signature

```typescript
export async function deriveTasteProfile(
  userId: string,
  db: SupabaseClient<Database>,
  ctx: HouseholdContext | null,
): Promise<TasteProfile>
```

**Note on household scope:** `recipe_history` has `user_id` but no `household_id`. Standard `scopeQuery` does not support querying across multiple user IDs. For household users, fetch all member IDs from `household_members` first, then use `.in('user_id', memberIds)`.

```typescript
// Resolve member IDs for the history queries
let memberIds: string[] = [userId]
if (ctx) {
  const { data: members } = await db
    .from('household_members')
    .select('user_id')
    .eq('household_id', ctx.householdId)
  memberIds = members?.map((m) => m.user_id) ?? [userId]
}
```

### Derivation logic

All date thresholds relative to today:

```typescript
const today = new Date()
const ago30  = new Date(today); ago30.setDate(today.getDate() - 30)
const ago90  = new Date(today); ago90.setDate(today.getDate() - 90)
const ago180 = new Date(today); ago180.setDate(today.getDate() - 180)
const sixMonthsAgo = ago180.toISOString().slice(0, 10)
```

**`loved_recipe_ids`** — combine explicit and implicit:

```typescript
// Explicit: make_again = true (any member)
const { data: explicitLoved } = await db
  .from('recipe_history')
  .select('recipe_id')
  .in('user_id', memberIds)
  .eq('make_again', true)

// Implicit: made >= IMPLICIT_LOVE_THRESHOLD times in last 6 months
const { data: recentHistory } = await db
  .from('recipe_history')
  .select('recipe_id, made_on')
  .in('user_id', memberIds)
  .gte('made_on', sixMonthsAgo)

const countMap = new Map<string, number>()
for (const entry of recentHistory ?? []) {
  countMap.set(entry.recipe_id, (countMap.get(entry.recipe_id) ?? 0) + 1)
}
const implicitLoved = [...countMap.entries()]
  .filter(([, n]) => n >= IMPLICIT_LOVE_THRESHOLD)
  .map(([id]) => id)

const lovedSet = new Set([
  ...(explicitLoved ?? []).map((r) => r.recipe_id),
  ...implicitLoved,
])
const loved_recipe_ids = [...lovedSet]
```

**`disliked_recipe_ids`:**

```typescript
const { data: disliked } = await db
  .from('recipe_history')
  .select('recipe_id')
  .in('user_id', memberIds)
  .eq('make_again', false)

const disliked_recipe_ids = [...new Set((disliked ?? []).map((r) => r.recipe_id))]
```

**`top_tags`** — join history with recipe tags, weight by recency:

```typescript
const { data: tagHistory } = await db
  .from('recipe_history')
  .select('made_on, recipes(tags)')
  .in('user_id', memberIds)
  .gte('made_on', sixMonthsAgo)

const tagWeights = new Map<string, number>()
const ago30Str = ago30.toISOString().slice(0, 10)
const ago90Str = ago90.toISOString().slice(0, 10)

for (const entry of tagHistory ?? []) {
  const weight = entry.made_on >= ago30Str ? 3
               : entry.made_on >= ago90Str ? 2
               : 1
  for (const tag of (entry.recipes?.tags as string[] | null) ?? []) {
    tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + weight)
  }
}

// Remove avoided tags and return top 10
const avoided = prefs?.avoided_tags ?? []
const top_tags = [...tagWeights.entries()]
  .filter(([tag]) => !avoided.includes(tag))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([tag]) => tag)
```

Note: `deriveTasteProfile` needs `prefs` for `avoided_tags`, `preferred_tags`, and `meal_context`. Accept them as a parameter or fetch them inside the function. Fetching inside is cleaner since the function is self-contained — use the same `fetchUserPreferences` helper from `app/api/plan/helpers.ts`, or inline the query using two-step `scopeQuery`:

```typescript
let prefsQ = db.from('user_preferences').select('avoided_tags, preferred_tags, meal_context')
prefsQ = scopeQuery(prefsQ, userId, ctx)
const { data: prefs } = await prefsQ.maybeSingle()
```

**`cooking_frequency`:**

```typescript
const { data: recent30 } = await db
  .from('recipe_history')
  .select('recipe_id')
  .in('user_id', memberIds)
  .gte('made_on', ago30.toISOString().slice(0, 10))

const distinctCount = new Set((recent30 ?? []).map((r) => r.recipe_id)).size
const cooking_frequency: CookingFrequency =
  distinctCount <= 2 ? 'light'
  : distinctCount <= 6 ? 'moderate'
  : 'frequent'
```

**`recent_recipes`** — last 10, joined with recipe title:

```typescript
const { data: recent } = await db
  .from('recipe_history')
  .select('recipe_id, made_on, recipes(title)')
  .in('user_id', memberIds)
  .order('made_on', { ascending: false })
  .limit(10)

const recent_recipes = (recent ?? []).map((r) => ({
  recipe_id: r.recipe_id,
  title:     (r.recipes as { title: string } | null)?.title ?? '',
  made_on:   r.made_on,
}))
```

**Empty profile:** if the user has no history, all arrays are empty, `cooking_frequency` is `'light'`, and `meal_context` is `null`. The caller handles graceful degradation — no errors.

---

## 8. Help Me Plan injection (`app/api/plan/suggest/route.ts`)

**File:** `app/api/plan/suggest/route.ts`

After the existing `fetchUserPreferences` call (line 34), add:

```typescript
import { deriveTasteProfile } from '@/lib/taste-profile'
import type { TasteProfile } from '@/types'

// After line 34 (fetchUserPreferences):
const tasteProfile = await deriveTasteProfile(user.id, db, ctx ?? null)
```

**Pre-filter disliked recipes** — add to the existing filtering block (after `alreadyPlannedIds` filtering, lines 71–75):

```typescript
const dislikedSet = new Set(tasteProfile.disliked_recipe_ids)
if (dislikedSet.size > 0) {
  for (const mt of Object.keys(recipesByMealType) as MealType[]) {
    recipesByMealType[mt] = recipesByMealType[mt].filter((r) => !dislikedSet.has(r.id))
  }
}
```

**Boost loved recipes** — move loved recipes to the front of each meal type list (loved recipes still respect cooldown; if they passed the cooldown filter they appear here):

```typescript
const lovedSet = new Set(tasteProfile.loved_recipe_ids)
for (const mt of Object.keys(recipesByMealType) as MealType[]) {
  const loved = recipesByMealType[mt].filter((r) => lovedSet.has(r.id))
  const rest  = recipesByMealType[mt].filter((r) => !lovedSet.has(r.id))
  recipesByMealType[mt] = [...loved, ...rest]
}
```

**Inject profile into system message** — update the `buildSystemMessage` call (line 86) to pass the profile:

```typescript
const systemMessage = buildSystemMessage(
  prefs,
  prefer_this_week ?? [],
  avoid_this_week ?? [],
  season,
  tasteProfile,   // new
)
```

---

## 9. `app/api/plan/helpers.ts` — update `buildSystemMessage`

**File:** `app/api/plan/helpers.ts`

Update the signature (line 214) to accept an optional `TasteProfile`:

```typescript
export function buildSystemMessage(
  prefs: UserPreferences | null,
  sessionPrefer: string[],
  sessionAvoid: string[],
  season: 'spring' | 'summer' | 'autumn' | 'winter',
  profile?: TasteProfile,
): string {
```

Add a private helper below `buildSystemMessage`:

```typescript
function buildTasteProfileSection(profile: TasteProfile): string {
  const isEmpty =
    !profile.loved_recipe_ids.length &&
    !profile.disliked_recipe_ids.length &&
    !profile.top_tags.length &&
    !profile.recent_recipes.length &&
    !profile.meal_context

  if (isEmpty) return ''

  const lines: string[] = ['\n\nUSER TASTE PROFILE\n------------------']

  if (profile.loved_recipe_ids.length) {
    // The caller has already annotated loved recipes with [LOVED] in the recipe list;
    // this section reinforces the signal with titles from recent_recipes
    const lovedTitles = profile.recent_recipes
      .filter((r) => profile.loved_recipe_ids.includes(r.recipe_id))
      .map((r) => r.title)
    if (lovedTitles.length) {
      lines.push(`Loved recipes — prefer these or similar: ${lovedTitles.join(', ')}`)
    }
    lines.push('Recipes marked [LOVED] in the recipe list should be strongly preferred.')
    lines.push('Recipes marked [DISLIKED] have already been removed from the list.')
  }

  if (profile.top_tags.length) {
    lines.push(`Top tags from recent cooking: ${profile.top_tags.join(', ')}`)
  }

  if (profile.meal_context) {
    lines.push(`Household context: ${profile.meal_context}`)
  }

  lines.push(`Cooking frequency: ${profile.cooking_frequency}`)

  return lines.join('\n')
}
```

At the end of `buildSystemMessage`, append the profile section:

```typescript
const tasteSection = profile ? buildTasteProfileSection(profile) : ''

return `...existing return string...${tasteSection}`
```

**Also update `buildFullWeekUserMessage`** to annotate loved/disliked recipes in the recipe list sent to the LLM. Pass `lovedSet` as an optional parameter and annotate:

```typescript
export function buildFullWeekUserMessage(
  activeDates: string[],
  recipesByMealType: Record<MealType, RecipeForLLM[]>,
  recentHistory: { title: string; made_on: string }[],
  freeText: string,
  activeMealTypes: MealType[],
  pantryContext: string = '',
  lovedIds?: Set<string>,   // new optional
): string {
  const recipesSection = activeMealTypes.map((mt) => {
    const list = shuffleArray(recipesByMealType[mt] ?? []).map((r) => ({
      recipe_id: r.id,
      title:     lovedIds?.has(r.id) ? `${r.title} [LOVED]` : r.title,
      tags:      r.tags,
    }))
    return `${mt}: ${JSON.stringify(list)}`
  }).join('\n')
  // ... rest unchanged
```

Update the call in `suggest/route.ts` to pass `lovedSet`:

```typescript
const userMessage = buildFullWeekUserMessage(
  active_dates,
  recipesByMealType,
  recentHistory,
  free_text ?? '',
  active_meal_types,
  pantryContext,
  lovedSet,   // new
)
```

---

## 10. `MakeAgainPrompt` component — new

**File:** `components/recipes/MakeAgainPrompt.tsx`

Shared non-blocking UI shown after a successful log.

```typescript
interface MakeAgainPromptProps {
  entryId:  string
  recipeId: string
  getToken: () => Promise<string> | string
  onDismiss: () => void
}
```

State: `status: 'idle' | 'saving' | 'done'`

**Renders:**

```
How did it go?
[👍 Make again]  [👎 Not for us]  [Skip]
```

Three pill buttons in a row. On selection:
1. Immediately set the chosen pill to its selected style (sage fill for 👍, muted red for 👎)
2. Call `PATCH /api/recipes/${recipeId}/log/${entryId}` with `{ make_again: true/false }`
3. After 1 second (whether save succeeds or not), call `onDismiss()`
4. "Skip" → calls `onDismiss()` immediately, no API call

Error handling: if the PATCH fails, still call `onDismiss()` after 1 second — never block the user on this prompt.

**Styling:**
- Container: `flex flex-col gap-2`
- Label: `text-sm font-medium text-stone-700` — "How did it go?"
- Pill row: `flex items-center gap-2`
- Unselected pill: `px-3 py-1.5 rounded-full border border-stone-200 text-sm text-stone-600 bg-white`
- Make again selected: `bg-sage-500 text-white border-sage-500`
- Not for us selected: `bg-red-100 text-red-700 border-red-200`
- Skip: plain text link, `text-xs text-stone-400 underline`

---

## 11. Recipe detail page (`app/(app)/recipes/[id]/page.tsx`)

**File:** `app/(app)/recipes/[id]/page.tsx`

**State additions:**

```typescript
const [makeAgainEntryId, setMakeAgainEntryId] = useState<string | null>(null)
```

**Update POST response type** (currently typed as `{ made_on: string; already_logged: boolean }` in `handleLogDate`, line ~96):

```typescript
const data: { made_on: string; already_logged: boolean; entry_id: string | null } = await res.json()
```

**After a successful log** (in `handleLogDate`, after `setLogStatus('success')` and before the `setTimeout`), set the entry ID to trigger the prompt:

```typescript
if (!data.already_logged && data.entry_id) {
  setMakeAgainEntryId(data.entry_id)
}
```

**Render `MakeAgainPrompt`** — show it below the log button when `makeAgainEntryId` is set:

```tsx
{makeAgainEntryId && (
  <MakeAgainPrompt
    entryId={makeAgainEntryId}
    recipeId={recipe.id}
    getToken={getAccessToken}
    onDismiss={() => setMakeAgainEntryId(null)}
  />
)}
```

The existing `logStatus` timeout (that resets the "✓ Logged" button) is unchanged. The prompt dismisses independently.

---

## 12. Cook Mode (`app/(cook)/recipes/[id]/cook/page.tsx`)

**File:** `app/(cook)/recipes/[id]/cook/page.tsx`

**State addition:**

```typescript
const [makeAgainEntryId, setMakeAgainEntryId] = useState<string | null>(null)
```

**Update POST response type** in `handleLog` (lines 194–216):

```typescript
const data: { made_on: string; already_logged: boolean; entry_id: string | null } = await res.json()
if (res.ok) {
  setLogStatus(data.already_logged ? 'already_logged' : 'success')
  if (!data.already_logged && data.entry_id) {
    setMakeAgainEntryId(data.entry_id)
  }
  setTimeout(() => setLogStatus('idle'), TOAST_DURATION_LONG_MS)
}
```

**Render `MakeAgainPrompt`** — on the final step, after the Log Made Today button (around line 399):

```tsx
{isLastStep && makeAgainEntryId && (
  <MakeAgainPrompt
    entryId={makeAgainEntryId}
    recipeId={params.id}
    getToken={getAccessToken}
    onDismiss={() => setMakeAgainEntryId(null)}
  />
)}
```

---

## 13. Plan week view (`app/(app)/plan/[week_start]/page.tsx`)

**File:** `app/(app)/plan/[week_start]/page.tsx`

**Writer must verify:** the grep for "Log Made Today" found nothing in the plan directory. Locate where logging is triggered from the plan week view — it likely uses the `LogMadeTodayButton` component from `components/recipes/LogMadeTodayButton.tsx`.

Once located, update the log call to capture `entry_id` from the response, and render `MakeAgainPrompt` inline beneath the logged recipe row (same pattern as §11 and §12).

If `LogMadeTodayButton` wraps the POST call internally (not exposing the response), the Writer needs to add an `onLogged?: (entryId: string) => void` callback prop to it so the parent can mount `MakeAgainPrompt`.

---

## 14. Preferences form (`components/preferences/PreferencesForm.tsx`)

Update the `meal_context` section (Section 0, around line 225):

- **Label:** "About our cooking" (was "About our meals")
- **Placeholder:** (full multi-line text from brief §3)
- **Helper text below field:** "The more you share, the better your suggestions get."
- **`maxLength`:** increase to 2000

Update `lib/schemas.ts` — `updatePreferencesSchema` `meal_context` field:

```typescript
meal_context: z.string().max(2000).nullable().optional(),
```

---

## 15. Business logic rules

All of the following must be enforced:

1. `make_again` is always optional — null is a valid permanent state. Never block a log on it.
2. `IMPLICIT_LOVE_THRESHOLD = 3` is exported from `lib/taste-profile.ts` as a named constant (not hardcoded inline).
3. Disliked recipes are **hard-excluded** from the plan suggest candidate pool before LLM call, not just soft-signalled.
4. Loved recipes respect cooldown — they are boosted only among recipes that already passed the cooldown filter.
5. Profile is derived fresh each request — no caching, no stored rows.
6. Household scope uses `.in('user_id', memberIds)` for `recipe_history` queries — standard `scopeQuery` is not sufficient here.
7. Empty profile (no history) produces no errors — all arrays empty, graceful LLM prompt.
8. `PATCH /api/recipes/[id]/log/[entry_id]` checks `user_id = user.id` — per-user sentiment, not household-shared ownership.
9. `make_again` flag in `POST /api/recipes/[id]/log` body is for API completeness; the primary UI path always uses PATCH.

---

## 16. Test cases

| ID | Test |
|----|------|
| T01 | `MakeAgainPrompt` appears after logging on recipe detail page |
| T02 | Tapping "Make again" calls PATCH with `make_again: true` |
| T03 | Tapping "Not for us" calls PATCH with `make_again: false` |
| T04 | Tapping "Skip" makes no API call and dismisses |
| T05 | `MakeAgainPrompt` dismisses after 1 second on selection |
| T06 | `POST /api/recipes/[id]/log` returns `entry_id` in response |
| T07 | `POST /api/recipes/[id]/log` accepts `make_again` in body and saves it |
| T08 | `PATCH /api/recipes/[id]/log/[entry_id]` updates `make_again` |
| T09 | `PATCH` returns 404 for entry not belonging to user |
| T10 | `deriveTasteProfile` — `loved_recipe_ids` includes `make_again=true` entries |
| T11 | `deriveTasteProfile` — `loved_recipe_ids` includes recipes made 3+ times in 6 months |
| T12 | `deriveTasteProfile` — `disliked_recipe_ids` includes `make_again=false` entries |
| T13 | `deriveTasteProfile` — `top_tags` weighted correctly (last 30d = 3×) |
| T14 | `deriveTasteProfile` — `cooking_frequency` buckets correct (0–2 = light, etc.) |
| T15 | `deriveTasteProfile` — `recent_recipes` returns last 10, newest first |
| T16 | `deriveTasteProfile` — empty history returns empty arrays, no error |
| T17 | Disliked recipes absent from plan suggest candidate pool before LLM call |
| T18 | Loved recipes appear before non-loved recipes in candidate pool |
| T19 | Taste profile injected into plan suggest system message |
| T20 | Empty profile produces no errors in plan suggest |
| T21 | Loved recipes still respect cooldown in plan suggestions |
| T22 | Household: `deriveTasteProfile` aggregates history from all member user IDs |
| T23 | `meal_context` field accepts up to 2000 characters |
| T24 | `MakeAgainPrompt` appears on Cook Mode final step after log |

---

## 17. Out of scope

Per brief — do not implement:
- Storing the taste profile as a DB row
- Surfacing the taste profile to the user
- Per-recipe ratings beyond thumbs up/down
- Automatic cuisine comfort zone expansion (Brief 22)
- Waste-aware planning (Brief 21)
- Injecting taste profile into Discover and Generate (Brief 21)
- Notification for loved recipes not cooked recently
- Sharing or exporting taste profiles
