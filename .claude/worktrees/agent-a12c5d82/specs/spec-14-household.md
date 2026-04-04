# Spec 14 — Household Sharing

## Summary

Enable multiple users to share a single household account. All household members share: recipes, meal plans, pantry items, grocery lists, preferences, and the custom tag library. Recipe history (and therefore cooldown filtering) remains per-user. Only the owner or co-owners can modify preferences, manage members, and transfer ownership. Every existing API route must be updated to resolve and apply household context before querying the database.

---

## 1. New TypeScript Types

Add to `types/index.ts`:

```typescript
export type HouseholdRole = 'owner' | 'co_owner' | 'member'

export interface Household {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface HouseholdMember {
  household_id: string
  user_id: string
  role: HouseholdRole
  joined_at: string
  email?: string        // populated by UI layer from auth.users
  display_name?: string
}

export interface HouseholdInvite {
  id: string
  household_id: string
  token: string
  invited_by: string
  expires_at: string
  used_by: string | null
  created_at: string
}

export interface HouseholdContext {
  householdId: string
  role: HouseholdRole
}
```

---

## 2. DB Changes — Migration `017_household.sql`

### 2a. New tables

```sql
-- Households
CREATE TABLE households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Membership
CREATE TABLE household_members (
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('owner','co_owner','member')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

-- One household per user
CREATE UNIQUE INDEX household_members_user_unique ON household_members(user_id);

-- Invite tokens (single-use, 7-day TTL)
CREATE TABLE household_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  token        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  used_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

### 2b. Add `household_id` to existing tables

```sql
ALTER TABLE recipes
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE meal_plans
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE pantry_items
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE grocery_lists
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE user_preferences
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE custom_tags
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;
```

### 2c. Partial unique indexes

```sql
-- grocery_lists: one list per household per week (separate from per-user constraint)
CREATE UNIQUE INDEX grocery_lists_household_week_start_unique
  ON grocery_lists(household_id, week_start)
  WHERE household_id IS NOT NULL;

-- user_preferences: one preferences row per household
CREATE UNIQUE INDEX user_preferences_household_unique
  ON user_preferences(household_id)
  WHERE household_id IS NOT NULL;

-- custom_tags: unique tag name per household
CREATE UNIQUE INDEX custom_tags_household_name_unique
  ON custom_tags(household_id, name)
  WHERE household_id IS NOT NULL;
```

### 2d. Indexes for lookup performance

```sql
CREATE INDEX recipes_household_id_idx       ON recipes(household_id)       WHERE household_id IS NOT NULL;
CREATE INDEX meal_plans_household_id_idx    ON meal_plans(household_id)     WHERE household_id IS NOT NULL;
CREATE INDEX pantry_items_household_id_idx  ON pantry_items(household_id)   WHERE household_id IS NOT NULL;
CREATE INDEX grocery_lists_household_id_idx ON grocery_lists(household_id)  WHERE household_id IS NOT NULL;
CREATE INDEX custom_tags_household_id_idx   ON custom_tags(household_id)    WHERE household_id IS NOT NULL;
```

### 2e. RLS notes

All existing tables use `createAdminClient()` (service role) in API routes, which bypasses RLS. No RLS changes are required — scoping is enforced in application code via `resolveHouseholdScope`. The new `households`, `household_members`, and `household_invites` tables should be created without RLS enabled; access is always via service role.

---

## 3. New Library — `lib/household.ts`

```typescript
import { type SupabaseClient } from '@supabase/supabase-js'
import type { HouseholdContext, HouseholdRole } from '@/types'

/**
 * Returns the household context for a user, or null if they are not in a household.
 * Always call this with the admin client (service role).
 */
export async function resolveHouseholdScope(
  db: SupabaseClient,
  userId: string,
): Promise<HouseholdContext | null> {
  const { data } = await db
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', userId)
    .single()
  if (!data) return null
  return { householdId: data.household_id, role: data.role as HouseholdRole }
}

/**
 * Checks whether the user's role permits write access to shared settings
 * (preferences, tag management, member management).
 */
export function canManage(role: HouseholdRole): boolean {
  return role === 'owner' || role === 'co_owner'
}
```

**Usage pattern in every route:**

```typescript
const db = createAdminClient()
const ctx = await resolveHouseholdScope(db, user.id)
// Solo user:     ctx === null  → filter by user_id
// Household:     ctx !== null  → filter by ctx.householdId
```

---

## 4. New Household API Routes

### `POST /api/household`
Create a new household. Fails if the user is already a member of a household.

**Input:** `{ name: string }`

**Logic:**
1. `resolveHouseholdScope` — if not null, return 409 "Already in a household."
2. Insert into `households` (`name`, `owner_id: user.id`).
3. Insert into `household_members` (`household_id`, `user_id: user.id`, `role: 'owner'`).
4. Return the new household row.

---

### `GET /api/household`
Get the current user's household and members.

**Output:** `{ household: Household, members: HouseholdMember[] } | null`

**Logic:**
1. `resolveHouseholdScope` — if null, return `{ household: null }`.
2. Fetch household row by `householdId`.
3. Fetch all `household_members` rows for `householdId`. Join with auth user emails/names via `db.auth.admin.listUsers()` or a separate `profiles` table if one exists; otherwise return `user_id` only and let the UI show "Member (ID)".
4. Return household + members array with `role` for each.

---

### `PATCH /api/household`
Update household name. Owner or co_owner only.

**Input:** `{ name: string }`

**Logic:**
1. Resolve scope. If null, 404.
2. `canManage(ctx.role)` — if false, 403.
3. Update `households.name`.

---

### `DELETE /api/household`
Delete the household. Owner only. Sets `household_id = NULL` on all linked rows (via `ON DELETE SET NULL` FK). Members' data is orphaned back to their `user_id`.

**Logic:**
1. Resolve scope. If null, 404.
2. If `ctx.role !== 'owner'`, 403.
3. Delete household row. FK cascade removes `household_members` and `household_invites`; `ON DELETE SET NULL` nulls `household_id` on recipes, meal_plans, pantry_items, grocery_lists, user_preferences, custom_tags.

---

### `POST /api/household/invite`
Generate a single-use invite token. Owner or co_owner only.

**Output:** `{ invite_url: string, expires_at: string }`

**Logic:**
1. Resolve scope. If null, 404. If not `canManage`, 403.
2. Insert into `household_invites` (`household_id`, `invited_by: user.id`). Token is auto-generated as a UUID.
3. Construct `invite_url = ${process.env.NEXT_PUBLIC_SITE_URL}/household/join?token=${token}`.
4. Return `{ invite_url, expires_at }`. **Do not send email.** The UI shows "Copy invite link."

---

### `GET /api/household/invite/validate?token=<token>`
Validate a token without consuming it. Always returns 200.

**Output:** `{ valid: boolean, household_name?: string, expires_at?: string }`

**Logic:**
1. Look up `household_invites` by `token`.
2. If not found: `{ valid: false }`.
3. If `used_by` is not null: `{ valid: false }`.
4. If `expires_at < now()`: `{ valid: false }`.
5. Otherwise: join `households` to get `name`, return `{ valid: true, household_name, expires_at }`.

---

### `POST /api/household/join`
Consume an invite token and join the household.

**Input:** `{ token: string }`

**Logic:**
1. Resolve scope — if not null, return 409 "Already in a household."
2. Fetch invite by `token`. If invalid/expired/used, 400.
3. Fetch the target household. If not found, 400.
4. Check one-household-per-user: `household_members` unique index will enforce this at DB level; also check in code.
5. Insert into `household_members` (`household_id`, `user_id: user.id`, `role: 'member'`).
6. Mark invite `used_by = user.id`.
7. **Data migration:** copy the joining user's solo recipes, pantry_items, and custom_tags into the household by setting `household_id` on those rows. Do **not** copy meal_plans, grocery_lists, or user_preferences — those are plan-scoped data that may conflict.
8. Return `{ household_id, household_name }`.

---

### `DELETE /api/household/members/[user_id]`
Remove a member from the household.

**Permission rules:**
- Any member can remove themselves (leave).
- Owner or co_owner can remove any non-owner member.
- Owner cannot be removed; must transfer ownership first.

**Logic:**
1. Resolve scope. If null, 404.
2. If `params.user_id !== user.id` and not `canManage(ctx.role)`, 403.
3. Fetch target member row. If not found, 404.
4. If target role is `'owner'` and caller is not the owner, 403.
5. If target is the owner (self-leave), 400 — must transfer or delete household.
6. Delete `household_members` row for `(household_id, params.user_id)`.
7. The leaving member's data (`household_id` rows) is **not** modified — it stays in the household. If they want their data back, that is a future feature.

---

### `PATCH /api/household/members/[user_id]`
Change a member's role. Owner only.

**Input:** `{ role: 'co_owner' | 'member' }`

**Logic:**
1. Resolve scope. If null, 404.
2. If `ctx.role !== 'owner'`, 403.
3. Cannot set role to `'owner'` via this route — use transfer.
4. Update `household_members.role`.

---

### `POST /api/household/transfer`
Transfer ownership to another member. Owner only.

**Input:** `{ new_owner_id: string }`

**Logic:**
1. Resolve scope. If null, 404.
2. If `ctx.role !== 'owner'`, 403.
3. Verify `new_owner_id` is a member of this household.
4. Update `household_members` set `role = 'owner'` where `user_id = new_owner_id`.
5. Update `household_members` set `role = 'co_owner'` where `user_id = user.id` (caller becomes co_owner).
6. Update `households.owner_id = new_owner_id`.

---

## 5. Modified API Routes

The pattern for every route is identical:

```typescript
const db = createAdminClient()
const ctx = await resolveHouseholdScope(db, user.id)

// Scoped query helper:
function scopeQuery(query: ReturnType<typeof db.from>) {
  return ctx
    ? query.eq('household_id', ctx.householdId)
    : query.eq('user_id', user.id)
}
```

All insert operations must also conditionally set `household_id`:

```typescript
const insertPayload = ctx
  ? { ...fields, household_id: ctx.householdId }
  : { ...fields, user_id: user.id }
```

### 5.1 `app/api/recipes/route.ts`

**GET:** Replace `.eq('user_id', user.id)` with scoped query.

**POST:** Insert with `household_id` or `user_id` based on context.

### 5.2 `app/api/recipes/[id]/route.ts`

**GET:** Fetch by `id` only; ownership is established at creation (no change needed).

**PATCH / DELETE:** Replace `existing.user_id !== user.id → 403` with:
- Solo: `existing.user_id !== user.id → 403`
- Household: `existing.household_id !== ctx.householdId → 403` (any member can edit)

### 5.3 `app/api/recipes/bulk/route.ts`

Replace per-recipe `r.user_id !== user.id → 403` with:
- Solo: `r.user_id !== user.id`
- Household: `r.household_id !== ctx.householdId`

### 5.4 `app/api/recipes/search/route.ts`

Replace `.eq('user_id', user.id)` with scoped query.

### 5.5 `app/api/pantry/route.ts`

**GET:** Replace `.eq('user_id', user.id)` with scoped query.

**POST (add item):** Insert with household or user scope.

**DELETE (bulk):** Authorization check: solo → `item.user_id === user.id`; household → `item.household_id === ctx.householdId`.

### 5.6 `app/api/groceries/route.ts`

**GET:** Replace `.eq('user_id', user.id).eq('week_start', weekStart)` with scoped query.

**PATCH:** Look up grocery list by scoped query before update.

### 5.7 `app/api/groceries/generate/route.ts`

**Meal plan lookup:** Replace `.eq('user_id', user.id)` with scoped query on `meal_plans`.

**Grocery list upsert:**
- Solo: `onConflict: 'user_id,week_start'`, payload includes `user_id`
- Household: `onConflict: 'household_id,week_start'`, payload includes `household_id`

Note: the `meal_plan_id` FK on `grocery_lists` uses the first plan's ID; this remains unchanged.

### 5.8 `app/api/plan/route.ts`

**GET:** Replace `.eq('user_id', user.id)` on `meal_plans` with scoped query.

**POST:** Insert `meal_plans` with `household_id` or `user_id`.

### 5.9 `app/api/plan/entries/route.ts`

**POST (add entry):** Fetch `meal_plans` by `id` AND scope. Create new plan with household or user scope.

### 5.10 `app/api/plan/entries/[entry_id]/route.ts`

Authorization: fetch `meal_plan_entries` join `meal_plans`. Replace `meal_plans.user_id === user.id` with:
- Solo: `meal_plans.user_id === user.id`
- Household: `meal_plans.household_id === ctx.householdId`

### 5.11 `app/api/plan/suggest/route.ts`

Update helper calls:
- `fetchUserPreferences(db, ctx?.householdId ?? user.id, !!ctx)` — new overload (see §6)
- `fetchRecipesByMealTypes(db, user.id, cooldownDays, active_meal_types, ctx)` — pass context
- `fetchRecentHistory(db, user.id)` — stays per-user (cooldown is per-user)

### 5.12 `app/api/plan/suggest/swap/route.ts`

Same pattern as suggest: pass `ctx` to recipe and preferences fetchers; keep history per-user.

### 5.13 `app/api/plan/match/route.ts`

Replace `.eq('user_id', user.id)` on recipes with scoped query.

### 5.14 `app/api/preferences/route.ts`

**GET:**
- Solo: `.eq('user_id', user.id).single()`
- Household: `.eq('household_id', ctx.householdId).single()`

**PATCH (upsert):**
- Solo: `onConflict: 'user_id'`, payload includes `user_id`
- Household:
  - `canManage(ctx.role)` — if false, 403 "Only owner or co-owner can update household preferences."
  - `onConflict: 'household_id'`, payload includes `household_id`

### 5.15 `app/api/tags/route.ts`

**GET:**
- Solo: `.eq('user_id', user.id)`
- Household: `.eq('household_id', ctx.householdId)`

**POST (create tag):**
- Solo: `canManage` check not required
- Household: any member can create tags (Writer may restrict to `canManage` if PO prefers — default: any member)
- Insert with `household_id` or `user_id`

### 5.16 `app/api/home/route.ts`

**Meal plans:** scoped query.

**Recipe history:** stays `.eq('user_id', user.id)` — history is always per-user.

---

## 6. Updated Helpers in `app/api/plan/helpers.ts`

### `fetchUserPreferences` — household-aware overload

```typescript
export async function fetchUserPreferences(
  supabase: SupabaseClient,
  userId: string,
  ctx: HouseholdContext | null,
): Promise<UserPreferences | null>
```

- If `ctx`: `.eq('household_id', ctx.householdId)`
- Else: `.eq('user_id', userId)`

### `fetchCooldownFilteredRecipes` — household-aware

```typescript
export async function fetchCooldownFilteredRecipes(
  supabase: SupabaseClient,
  userId: string,
  cooldownDays: number,
  categories?: string[],
  ctx?: HouseholdContext | null,
): Promise<RecipeForLLM[]>
```

- Recipe fetch: scoped by `household_id` or `user_id`
- History fetch (cooldown): always `.eq('user_id', userId)` — cooldown is per-requesting-user

### `fetchPantryContext` — household-aware (if present from spec-12)

```typescript
export async function fetchPantryContext(
  supabase: SupabaseClient,
  userId: string,
  ctx?: HouseholdContext | null,
): Promise<string>
```

- Pantry fetch: scoped by `household_id` or `user_id`

---

## 7. React Context — `lib/household-context.tsx`

```typescript
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { HouseholdContext, HouseholdMember, Household } from '@/types'

interface HouseholdState {
  household: Household | null
  members: HouseholdMember[]
  myRole: HouseholdRole | null
  loading: boolean
  refresh: () => void
}

const HouseholdCtx = createContext<HouseholdState>({
  household: null,
  members: [],
  myRole: null,
  loading: true,
  refresh: () => {},
})

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  // Fetch /api/household on mount; expose via context
  // ...
}

export function useHousehold(): HouseholdState {
  return useContext(HouseholdCtx)
}
```

Add `<HouseholdProvider>` to the root layout (`app/layout.tsx`) inside the existing auth provider.

---

## 8. UI Components

### 8a. `/app/settings/household/page.tsx`

Three states based on household membership:

**State A — Solo user (no household):**
- Heading: "Household Sharing"
- Description: "Invite others to share recipes, meal plans, pantry, and grocery lists."
- Button: "Create a household" → opens a name input + confirm flow → `POST /api/household`
- Section: "Join an existing household" → text input for invite link + "Join" button

**State B — Member of a household:**
- Shows household name, member list with roles and `joined_at` dates.
- "Copy invite link" button: calls `POST /api/household/invite`, copies resulting `invite_url` to clipboard. Shows only for `canManage` roles.
- "Leave household" button: calls `DELETE /api/household/members/[user.id]`; confirm dialog warns "Your data will remain in the household."
- For owner: "Delete household" button (confirm dialog); "Transfer ownership" dropdown of co_owners/members.
- For owner/co_owner: "Manage members" — change role (dropdown per member) or remove member (trash icon + confirm).

**State C — Owner viewing deletion confirm:**
- "Are you sure? This will remove all members. Your recipes, pantry, and plans will return to your personal account." (Because `ON DELETE SET NULL` orphans the data back.)

### 8b. `/app/household/join/page.tsx`

Shown when user visits an invite URL (`/household/join?token=...`).

1. On mount: call `GET /api/household/invite/validate?token=...`.
2. If invalid: "This invite link is invalid or has expired."
3. If valid: show household name, "Join [Household Name]" button.
4. On confirm: `POST /api/household/join { token }` → redirect to `/` with a success toast.
5. If already in a household: show "You are already a member of a household. Leave your current household before joining another."

### 8c. Settings nav integration

Add "Household" entry to the settings sidebar/tabs in `app/settings/layout.tsx` (or equivalent). Link to `/settings/household`.

---

## 9. Business Logic Rules

1. **One household per user.** Enforced by unique index on `household_members(user_id)`. The join route also checks in code before inserting.

2. **Join data migration.** When a user joins, their solo `recipes`, `pantry_items`, and `custom_tags` get `household_id` set. `meal_plans` and `grocery_lists` are **not** migrated (plan data is week-specific and potentially conflicting).

3. **Leave does not delete data.** When a member leaves, their rows' `household_id` column is not modified. Their data stays in the household. If the owner wants to remove a member's data, that is out of scope.

4. **Household deletion orphans data gracefully.** `ON DELETE SET NULL` on all `household_id` FKs means rows revert to being owned by `user_id` only.

5. **Cooldown is always per-user.** `fetchRecentHistory` and `fetchCooldownFilteredRecipes`'s history query always use `user_id`, never `household_id`. Members are not penalized for each other's meal history.

6. **Preferences are per-household when in a household.** Only one `user_preferences` row exists per household (enforced by partial unique index). The owner or co_owner can update it. Solo members who joined bring their own preferences into the household at join time — the Writer should copy the joining user's preferences if no household preferences exist yet, or leave the existing household preferences intact if they do.

7. **Tags are shared.** `custom_tags` are scoped to `household_id`. Any member can create tags (for simplicity; Writer may restrict to `canManage` if preferred). Tag validation in the recipe form always checks the household's tag pool.

8. **Role hierarchy:**
   - `owner`: full control (delete household, transfer ownership, manage all members, update preferences, create/revoke invites)
   - `co_owner`: manage members (excluding owner), update preferences, create invites
   - `member`: read all shared data, add/edit recipes, manage pantry/grocery, create tags

9. **No email sending.** Invites return a URL only. The UI shows "Copy invite link." Email delivery is a future feature.

10. **`NEXT_PUBLIC_SITE_URL` env var** is used to construct invite URLs. It is already in `.env.local.example`.

---

## 10. Test Cases

| ID | Scenario | Expected |
|----|----------|----------|
| T01 | Solo user creates household | `households` row created, user inserted as `owner`, membership unique index enforced |
| T02 | User tries to create second household | 409 returned |
| T03 | Owner generates invite | Returns `invite_url` with valid token; no email sent |
| T04 | Validate valid token | `{ valid: true, household_name, expires_at }` |
| T05 | Validate used token | `{ valid: false }` |
| T06 | Validate expired token | `{ valid: false }` |
| T07 | User joins via token | Membership created, invite marked used, solo recipes/pantry/tags migrated to household |
| T08 | User tries to join second household | 409 "Already in a household" |
| T09 | Member leaves household | `household_members` row deleted; member's data rows retain `household_id` |
| T10 | Owner leaves without transferring | 400 "Transfer ownership first" |
| T11 | co_owner removes owner | 403 |
| T12 | member removes another member | 403 |
| T13 | Owner transfers ownership | New owner has `role=owner`; former owner has `role=co_owner`; `households.owner_id` updated |
| T14 | Owner deletes household | All member rows deleted; `household_id` set to NULL on all linked rows |
| T15 | GET /api/recipes — solo user | Returns only user's solo recipes |
| T16 | GET /api/recipes — household member | Returns all household recipes |
| T17 | POST /api/recipes — household member | New recipe has `household_id` set |
| T18 | DELETE /api/recipes/[id] — household member deletes another's recipe | 200 (members can manage household recipes) |
| T19 | GET /api/preferences — household member | Returns household preferences row |
| T20 | PATCH /api/preferences — member role | 403 "Only owner or co-owner can update household preferences" |
| T21 | PATCH /api/preferences — co_owner | 200, household preferences updated |
| T22 | Cooldown filtering — household | Recipes already cooked by *requesting user* within cooldown are excluded; sibling member's history does not affect suggestions |
| T23 | GET /api/tags — household member | Returns household tag library |
| T24 | POST /api/tags — household member creates tag | Tag has `household_id` set |
| T25 | POST /api/groceries/generate — household | Grocery list created/upserted with `household_id`; conflict key is `household_id,week_start` |
| T26 | GET /api/household — solo user | Returns `{ household: null }` |
| T27 | GET /api/household — household member | Returns household + members array with roles |

---

## 11. Out of Scope

- Email delivery for invites (future brief)
- Per-member recipe ownership within a household (all household recipes are shared)
- Retroactive data removal when a member leaves (data stays in household)
- Household-scoped recipe history / shared cooking log
- Multiple households per user
- Invite expiry auto-cleanup (dead tokens remain in DB; clean up via cron in a future sprint)
- Mobile push notifications for household events

---

Awaiting owner approval before Writer proceeds.
