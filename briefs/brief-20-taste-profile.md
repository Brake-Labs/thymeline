# Brief 20 — User Taste Profile

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/taste-profile`
**Target:** PR into `main`
**Depends on:** Briefs 01–07, Brief 12 (Pantry) merged to main

---

## User Story

As a Thymeline user, I want the app to learn what I actually like to cook and
eat — not just what I've told it in preferences, but from how I actually use it
— so that every suggestion, generation, and discovery feels increasingly
tailored to my household over time.

---

## Core Concept

The taste profile is a lightweight, always-improving model of the user's cooking
preferences. It is built from three sources:

1. **Explicit signals** — "Make Again" flags after logging a recipe
2. **Implicit signals** — cooking frequency, recency, and tag patterns
3. **Stated context** — the expanded `meal_context` free-text field in preferences

The profile is not a separate data structure — it is derived at query time from
existing data and the new `make_again` field. It is injected as context into
Help Me Plan, Recipe Generation, Recipe Discovery, and AI Recipe Edit so all
four surfaces feel like they know the user. The profile is never shown to the
user directly — it works silently in the background.

This brief covers:
- The "Make Again" flag
- Profile derivation logic
- Expanded `meal_context` field in Preferences
- Injection into Help Me Plan (the highest-value surface)

Briefs 21–22 will inject the profile into the remaining surfaces and add
waste-aware planning and novelty expansion.

---

## 1. "Make Again" Flag

### When it appears

After a recipe is logged as made — via any log path:
- "Log Made Today" button on the recipe detail page
- "Log Made Today" button in Cook Mode
- "Log Made Today" on the Help Me Plan summary screen
- The existing `POST /api/recipes/[id]/log` endpoint

A follow-up prompt appears immediately after the success confirmation:

> **How did it go?**
> [👍 Make again] [👎 Not for us] [Skip]

The prompt is non-blocking — "Skip" or dismissing it leaves `make_again` as
null. It never prevents the log from completing.

### Prompt placement

- **Recipe detail page**: replaces the "✓ Logged" success state for 4 seconds,
  then shows the flag prompt below the button
- **Cook Mode**: shown as a card at the bottom of the final step after "✓ Logged"
  appears
- **Plan summary**: shown inline beneath the logged recipe row

### UI

Three pill buttons in a row:
- 👍 "Make again" — sage fill on select
- 👎 "Not for us" — muted red fill on select
- "Skip" — plain text link

On selection: animate the chosen pill, save the flag, dismiss the prompt after
1 second. No further interaction required.

### DB — add `make_again` to `recipe_history`

```sql
alter table recipe_history
  add column if not exists make_again boolean;
  -- null = not answered, true = make again, false = not for us
```

Migration: `024_recipe_history_make_again.sql`

### API — update `POST /api/recipes/[id]/log`

Add optional `make_again` field to the request body:
```typescript
{ made_on?: string, make_again?: boolean }
```

This allows the flag to be saved in the same call if the user responds
immediately, or via a separate follow-up call.

### `PATCH /api/recipes/[id]/log/[entry_id]`

New endpoint — allows updating `make_again` on an existing history entry
after the fact (e.g. the user answered "Skip" but then changes their mind):

Input: `{ make_again: boolean }`
Response: `200` with updated entry. `403` if not owner.

---

## 2. Profile Derivation

The taste profile is computed server-side whenever it is needed (no caching for
v1 — derive fresh each time from existing data). It is never stored as a row in
the DB.

### `lib/taste-profile.ts` — new file

```typescript
export interface TasteProfile {
  loved_recipe_ids:    string[]   // make_again=true, or made 3+ times
  disliked_recipe_ids: string[]   // make_again=false
  top_tags:            string[]   // most cooked tags, weighted by recency
  avoided_tags:        string[]   // from user_preferences
  preferred_tags:      string[]   // from user_preferences
  meal_context:        string | null  // free-text from preferences
  cooking_frequency:   'light' | 'moderate' | 'frequent'  // recipes/month
  recent_recipes:      { recipe_id: string, title: string, made_on: string }[]
  // last 10 made
}

export async function deriveTasteProfile(
  userId: string,
  db: SupabaseClient
): Promise<TasteProfile>
```

**Derivation logic:**

**`loved_recipe_ids`:**
- Any recipe with `make_again = true` in `recipe_history`
- Any recipe made 3 or more times in the last 6 months (implicit love)

**`disliked_recipe_ids`:**
- Any recipe with `make_again = false` in `recipe_history`

**`top_tags`:**
- Aggregate all tags from recipes made in the last 6 months
- Weight by recency (last 30 days = 3x, last 90 days = 2x, last 6 months = 1x)
- Return top 10 tags by weighted frequency
- Exclude avoided_tags from the result

**`cooking_frequency`:**
- Count distinct recipes made in the last 30 days
- 0–2: `'light'`
- 3–6: `'moderate'`
- 7+: `'frequent'`

**`recent_recipes`:**
- Last 10 `recipe_history` entries joined with recipe title
- Used to avoid repeating very recent meals

---

## 3. Expanded `meal_context` Field

The existing `meal_context` text field in Preferences is expanded in scope and
given richer UI guidance to encourage useful input.

### UI changes (`components/preferences/PreferencesForm.tsx`)

**Label:** "About our cooking" (was "About our meals")

**Placeholder (expanded):**
```
Tell us about your household and cooking style. For example:
- Family of 4 with two kids who hate spice
- Mostly weeknight cooking, prefer meals under 45 minutes
- Love Asian and Mediterranean food, want to explore more Indian
- Sheet pan and one-pot are our go-to methods
- Trying to reduce meat — open to 2-3 vegetarian nights a week
```

**Helper text below the field:**
"The more you share, the better your suggestions get."

**Character limit:** increase from 1000 to 2000 characters.

Update the DB column max length and Zod validation to match.

Migration: `025_meal_context_length.sql`
```sql
alter table user_preferences
  alter column meal_context type text;
  -- text in Postgres is already unlimited; just remove any varchar constraint
```

---

## 4. Inject Taste Profile into Help Me Plan

The taste profile is injected into `POST /api/plan/suggest` as additional
context for the LLM.

### Changes to `app/api/plan/suggest/route.ts`

1. After fetching user preferences, call `deriveTasteProfile(userId, db)`

2. Add a taste profile section to the system prompt:

```
USER TASTE PROFILE
------------------
Loved recipes (make these or similar more often):
{loved_recipe_titles}

Disliked recipes (avoid these):
{disliked_recipe_titles}

Top tags from recent cooking: {top_tags}

Cooking frequency: {cooking_frequency}

Recent meals (avoid repeating these):
{recent_recipe_titles}

Household context:
{meal_context}
```

3. Boost loved recipes in the candidate pool:
- Move loved recipes to the top of the recipe list sent to the LLM
- Add a note in the prompt: "Recipes marked [LOVED] should be strongly
  preferred. Recipes marked [DISLIKED] should be excluded."

4. Pre-filter disliked recipes from the candidate pool before sending to LLM
   (don't even include them as options).

5. Keep the existing cooldown logic — loved recipes still respect the cooldown
   window. Love doesn't override rest.

---

## API Changes Summary

| Route | Change |
|---|---|
| `POST /api/recipes/[id]/log` | Accept optional `make_again: boolean` |
| `PATCH /api/recipes/[id]/log/[entry_id]` | New — update `make_again` on existing entry |
| `POST /api/plan/suggest` | Derive and inject taste profile |
| `PATCH /api/preferences` | Accept `meal_context` up to 2000 chars |

---

## Types (`types/index.ts`)

```typescript
export interface RecipeHistoryEntry {
  id:          string
  recipe_id:   string
  user_id:     string
  made_on:     string
  make_again:  boolean | null   // new
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
  recent_recipes:      { recipe_id: string, title: string, made_on: string }[]
}
```

---

## Business Logic

1. **`make_again` is always optional** — the prompt appears but can always be
   skipped. null is a valid permanent state. Never block or nag.

2. **Implicit love threshold** — 3 times in 6 months is the threshold for
   implicit "loved" status. This is configurable as a constant in
   `lib/taste-profile.ts`.

3. **Disliked recipes are pre-filtered** — they never appear as suggestions
   in Help Me Plan, even if they pass cooldown and tag filters. This is a hard
   exclusion, not just a soft signal to the LLM.

4. **Loved recipes still respect cooldown** — being loved doesn't mean eating
   it every week. Cooldown prevents overuse even of favorites.

5. **Profile is derived fresh each request** — no caching in v1. If a user
   logs a recipe and immediately opens Help Me Plan, the new signal is included.
   Performance should be acceptable given the small data volume per user.

6. **Household scope** — in a household, the taste profile is derived from
   all members' `recipe_history` combined. `make_again` flags from any member
   count. `meal_context` is the household's shared context.

7. **Empty profile gracefully degrades** — if the user has no history and no
   preferences, the taste profile is all empty arrays and the LLM prompt
   simply omits the profile section. No errors.

8. **`PATCH /api/recipes/[id]/log/[entry_id]`** — the entry_id is the primary
   key of the `recipe_history` row. Only the owner can update. Only `make_again`
   can be updated via this endpoint (not `made_on`).

9. **Profile is never shown to the user** — it works silently. The only
   user-facing changes in this brief are the "Make Again" prompt and the
   expanded `meal_context` field.

---

## Test Cases

| # | Test case |
|---|---|
| T01 | "Make Again" prompt appears after logging a recipe |
| T02 | Tapping "Make again" saves make_again=true on the history entry |
| T03 | Tapping "Not for us" saves make_again=false |
| T04 | Tapping "Skip" leaves make_again=null |
| T05 | Dismissing the prompt leaves make_again=null |
| T06 | POST /api/recipes/[id]/log accepts make_again field |
| T07 | PATCH /api/recipes/[id]/log/[entry_id] updates make_again |
| T08 | PATCH returns 403 for non-owner |
| T09 | deriveTasteProfile includes make_again=true recipes in loved_recipe_ids |
| T10 | deriveTasteProfile includes recipes made 3+ times in loved_recipe_ids |
| T11 | deriveTasteProfile includes make_again=false in disliked_recipe_ids |
| T12 | deriveTasteProfile calculates top_tags weighted by recency |
| T13 | deriveTasteProfile returns correct cooking_frequency bucket |
| T14 | deriveTasteProfile returns last 10 recent_recipes |
| T15 | Disliked recipes are excluded from plan suggestions candidate pool |
| T16 | Loved recipes are boosted to top of candidate pool |
| T17 | Taste profile injected into plan suggest system prompt |
| T18 | Empty profile produces no errors in plan suggest |
| T19 | meal_context accepts up to 2000 characters |
| T20 | Loved recipes still respect cooldown in plan suggestions |
| T21 | Household: make_again flags from all members contribute to profile |

---

## Out of Scope

- Storing the taste profile as a DB row (derived fresh each time in v1)
- Surfacing the taste profile to the user
- Per-recipe ratings beyond thumbs up/down
- Automatic cuisine comfort zone expansion (Brief 22)
- Waste-aware planning (Brief 21)
- Injecting taste profile into Discover and Generate (Brief 21)
- Notification: "You haven't cooked [loved recipe] in a while"
- Sharing taste profiles between households
- Export of taste profile data
