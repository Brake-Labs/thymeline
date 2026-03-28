# Brief 14 — Household Sharing

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/household`
**Target:** PR into `staging`
**Depends on:** Briefs 01–07, Brief 12 (Pantry) merged to staging

---

## User Story

As a Forkcast user, I want to share my recipe box, meal plan, pantry, and grocery
list with my household so everyone can contribute, check things off, and plan
meals together — without duplicating effort or maintaining separate lists.

---

## Core Concept

A household is a group of Forkcast users who share:
- A single recipe vault (all members' recipes visible to all)
- A shared meal plan and calendar
- A shared pantry
- A shared grocery list
- One set of meal planning preferences

One member is the owner. The owner can promote members to co-owner. Co-owners
have the same permissions as the owner except they cannot delete the household
or remove the owner.

A user can only belong to one household at a time. When a member leaves, their
recipes stay in the shared vault.

---

## Membership Model

### Roles

| Role | Permissions |
|---|---|
| Owner | All permissions including delete household, remove any member |
| Co-owner | All permissions except delete household and remove owner |
| Member | Add/edit/delete own recipes, edit shared plan/pantry/grocery list |

### Household states for a user

- **No household** — solo user, all data is personal
- **In a household** — all shared resources (vault, plan, pantry, grocery list)
  belong to the household, not the individual
- **Pending invite** — user has been invited but hasn't accepted yet

---

## Screens & Features

### 1. Household Settings (`/settings/household`)

A new section in settings. Accessible from the settings gear in the nav.

**State A — No household:**
- Heading: "Your Household"
- Body: "Share your recipe box, meal plan, pantry, and grocery list with the
  people you cook with."
- Two CTAs:
  - "Create a household" — creates a new household with the current user as owner
  - "Join with a code" — text input to enter an invite code

**State B — In a household (owner/co-owner view):**
- Household name (editable inline, default: "[Owner first name]'s Household")
- Member list: avatar/initials + name + role badge + "Remove" button (owner/co-owner only, cannot remove self)
- "Promote to co-owner" option on member rows (owner only)
- "Invite someone" section:
  - "Invite by email" — email input + "Send invite" button
  - "Share invite link" — generates a link, copy-to-clipboard button, link expires in 7 days
- "Leave household" link (destructive, confirmation required). Owner cannot leave
  unless they transfer ownership or delete the household.
- "Delete household" button (owner only, destructive, confirmation required)

**State C — In a household (member view):**
- Same as B but without invite, remove member, promote, and delete controls
- "Leave household" link visible

### 2. Household Invite Flow

**Invite by email:**
1. Owner/co-owner enters an email address
2. Server sends an email with an invite link (`/household/join?token=abc123`)
3. If the email belongs to an existing Forkcast user: they see a join prompt on
   next login
4. If the email is new: they go through the standard app invite flow first, then
   the household join prompt

**Invite by link:**
1. Owner/co-owner generates a link
2. Recipient visits `/household/join?token=abc123`
3. If not logged in: redirect to `/login?household_invite=abc123`
4. After auth: shown a join prompt — household name, owner name, member count
5. On accept: user joins the household
6. On decline: user continues as solo

**Joining with a code:**
- On `/settings/household` (no-household state): "Join with a code" input
- User pastes the token from an invite link
- Same join prompt as above

### 3. Data Visibility After Joining

When a user joins a household, all shared resources switch to household scope:

| Resource | Before joining | After joining |
|---|---|---|
| Recipe Box | Personal recipes | All household members' recipes |
| Meal Plan | Personal plan | Shared household plan |
| Calendar | Personal calendar | Shared household calendar |
| Pantry | Personal pantry | Shared household pantry |
| Grocery List | Personal list | Shared household list |
| Preferences | Personal | Shared household preferences |

A user's personal data (recipes they added, history entries) is retained and
becomes part of the household pool. It does not disappear.

### 4. Shared Resources — Behavioral Changes

**Recipe Box:**
- All recipes belonging to any household member are visible to all members
- Any member can add, edit, or delete any recipe in the shared vault
- Recipe history (`recipe_history`) remains per-user — each member logs their
  own made dates
- Cooldown is calculated per-user (not household-wide)

**Meal Plan & Calendar:**
- The household shares one active meal plan per week
- Any member can add, edit, or delete plan entries
- Changes are reflected in real time for all members (on next page load — no
  websockets required for v1)
- "Last edited by [name]" shown on plan entries (optional, nice to have)

**Pantry:**
- One shared pantry for the household
- Any member can add, edit, or delete pantry items
- "Added by [name]" shown on each item

**Grocery List:**
- One shared grocery list per week
- Any member can check off items, add items, or regenerate
- "Got it" state is shared — if one member checks off an item, it's checked for all
- "Added by [name]" shown on manually added items

**Preferences:**
- One shared set of preferences for the household
- Any co-owner or owner can edit preferences
- Members cannot edit preferences

---

## Data Model

### `households` table

```sql
create table households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  owner_id     uuid not null references auth.users(id),
  created_at   timestamptz default now()
);

alter table households enable row level security;

create policy "members can read their household"
  on households for select
  using (
    id in (
      select household_id from household_members
      where user_id = auth.uid()
    )
  );

create policy "owner can update household"
  on households for update
  using (owner_id = auth.uid());

create policy "owner can delete household"
  on households for delete
  using (owner_id = auth.uid());
```

### `household_members` table

```sql
create table household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner', 'co_owner', 'member'))
               default 'member',
  joined_at    timestamptz default now(),
  unique(household_id, user_id)
);

alter table household_members enable row level security;

create policy "members can read their household members"
  on household_members for select
  using (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
    )
  );
```

### `household_invites` table

```sql
create table household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  invited_by   uuid not null references auth.users(id),
  email        text,           -- null for link-based invites
  token        text not null unique,
  used_by      uuid references auth.users(id),
  used_at      timestamptz,
  expires_at   timestamptz not null,
  created_at   timestamptz default now()
);

alter table household_invites enable row level security;

create policy "public can read invites by token"
  on household_invites for select
  using (true);

create policy "members can create invites"
  on household_invites for insert
  to authenticated
  with check (
    household_id in (
      select household_id from household_members
      where user_id = auth.uid()
        and role in ('owner', 'co_owner')
    )
  );
```

### Scoping existing tables to household

Add `household_id` to shared resource tables:

```sql
-- Recipes: add household_id
alter table recipes
  add column if not exists household_id uuid references households(id);

-- meal_plans: add household_id
alter table meal_plans
  add column if not exists household_id uuid references households(id);

-- pantry_items: add household_id
alter table pantry_items
  add column if not exists household_id uuid references households(id);

-- grocery_lists: add household_id
alter table grocery_lists
  add column if not exists household_id uuid references households(id);

-- user_preferences: add household_id (null = personal prefs)
alter table user_preferences
  add column if not exists household_id uuid references households(id);
```

Migration: `016_household.sql`

When `household_id` is null on these tables, the row belongs to a solo user.
When set, it belongs to the household. All queries must be updated to filter
by `household_id` (if in a household) OR `user_id` (if solo).

### TypeScript types (`types/index.ts`)

```typescript
export type HouseholdRole = 'owner' | 'co_owner' | 'member'

export interface Household {
  id:         string
  name:       string
  owner_id:   string
  created_at: string
}

export interface HouseholdMember {
  id:           string
  household_id: string
  user_id:      string
  role:         HouseholdRole
  joined_at:    string
  // joined from auth.users:
  email:        string
  display_name: string | null
}

export interface HouseholdInvite {
  id:           string
  household_id: string
  invited_by:   string
  email:        string | null
  token:        string
  used_by:      string | null
  used_at:      string | null
  expires_at:   string
  created_at:   string
}
```

---

## API Routes

### `POST /api/household`
Create a new household. Sets current user as owner. Creates a `household_members`
row with role `'owner'`. Returns the created household.

Input: `{ name?: string }` — defaults to "[First name]'s Household"

### `GET /api/household`
Returns the current user's household (if any), including member list with roles.
Returns `{ household: null }` if not in a household.

### `PATCH /api/household`
Update household name. Owner/co-owner only.

### `DELETE /api/household`
Delete the household and all associated data. Owner only. Requires confirmation
in the request body: `{ confirm: true }`.

### `POST /api/household/invite`
Generate an invite. Owner/co-owner only.

Input:
```typescript
{
  email?: string    // if provided, send an email invite
  // if no email, returns a link-only invite
}
```

Response:
```typescript
{
  invite_url: string
  token:      string
  expires_at: string
}
```

### `GET /api/household/invite/validate?token=<token>`
Check if a household invite token is valid (exists, unused, not expired).
No auth required.

Response: `{ valid: boolean, household_name?: string, reason?: string }`

### `POST /api/household/join`
Accept a household invite. Authenticated.

Input: `{ token: string }`

Behavior:
1. Validate token
2. If user is already in a household: return `400` ("Leave your current household first")
3. Mark invite as used
4. Insert `household_members` row with role `'member'`
5. Migrate user's existing data to household scope (set `household_id` on their
   recipes, pantry items, etc.)
6. Return the joined household

### `DELETE /api/household/members/[user_id]`
Remove a member. Owner can remove anyone. Co-owner can remove members only.
A user can remove themselves (leave).

Special case: if the owner removes themselves, they must transfer ownership first.

### `PATCH /api/household/members/[user_id]`
Update a member's role. Owner only.

Input: `{ role: 'co_owner' | 'member' }`

Cannot demote the owner via this endpoint.

### `POST /api/household/transfer`
Transfer ownership to another member. Owner only.

Input: `{ new_owner_id: string }`

Behavior: sets new owner's role to `'owner'`, sets previous owner's role to
`'co_owner'`.

---

## Household Context in the App

Add a `useHousehold()` hook (or server-side equivalent) that:
1. Fetches `GET /api/household` on app load
2. Returns `{ household, members, role, isInHousehold }`
3. Is available throughout the app via context

All API routes that touch shared resources (recipes, plan, pantry, grocery)
must:
1. Check if the user is in a household
2. If yes: scope queries to `household_id`
3. If no: scope queries to `user_id`

This is a cross-cutting concern — the Architect should specify the exact
query pattern for each affected route.

---

## Settings Integration

Add "Household" section to `/settings/preferences`:
- Shown above or below the existing preference sections
- Links to `/settings/household`
- Shows current household name + member count if in a household, or
  "Not in a household" with a "Set up household" link if not

---

## Nav Updates

No new nav item needed. Household is accessed via the settings gear.

---

## Business Logic

1. **Solo → household migration** — when a user joins a household, their
   existing recipes, pantry items, meal plans, and grocery lists are migrated
   to household scope by setting `household_id`. Their personal `user_preferences`
   row is superseded by the household preferences (the household uses the joining
   user's preferences as the initial household preferences if none exist yet).

2. **Leaving a household** — when a member leaves, their `household_id` is
   cleared from their data. Their recipes remain in the shared vault (i.e.
   `household_id` stays set on recipes — they contributed them). Their future
   recipes (after leaving) will be personal. Pantry items and grocery list items
   they added remain in the household.

3. **Household deletion** — deletes the household row (cascades to
   `household_members` and `household_invites`). All shared resources have
   `household_id` set to null (orphaned to their original `user_id`).

4. **One household per user** — enforced at the API level. `POST /api/household/join`
   returns 400 if the user already has a `household_members` row.

5. **Preferences ownership** — household preferences are owned by the household
   (stored with `household_id`). Only owners and co-owners can edit them.
   Members see preferences as read-only in settings.

6. **Real-time updates** — v1 does not require websockets. Shared data updates
   are visible on next page load or manual refresh. Add a subtle "Refresh" button
   on the plan/calendar/grocery screens for households.

7. **Invite expiry** — household invites expire after 7 days, same as app invites.
   A new invite must be generated after expiry.

8. **Email invites** — if the invited email doesn't have a Forkcast account,
   the invite email includes both the app invite link and the household join token.
   They complete app signup first, then household join.

9. **Co-owner limit** — no hard limit on co-owners, but the UI should make it
   clear that co-owners have near-full admin access.

---

## Test Cases

| # | Test case |
|---|---|
| T01 | POST /api/household creates household with owner role |
| T02 | GET /api/household returns null for solo user |
| T03 | GET /api/household returns household + members for member |
| T04 | POST /api/household/invite generates valid token |
| T05 | GET /api/household/invite/validate returns valid for unused token |
| T06 | GET /api/household/invite/validate returns invalid for expired token |
| T07 | POST /api/household/join adds user as member |
| T08 | POST /api/household/join returns 400 if user already in a household |
| T09 | Joining migrates user's recipes to household_id |
| T10 | After joining, GET /api/recipes returns all household recipes |
| T11 | After joining, GET /api/pantry returns shared household pantry |
| T12 | Member can add a recipe visible to all household members |
| T13 | Member can add pantry item visible to all household members |
| T14 | Member can check off grocery item — state shared with all members |
| T15 | Member cannot edit household preferences |
| T16 | Co-owner can edit household preferences |
| T17 | Owner can remove a member |
| T18 | Co-owner cannot remove owner |
| T19 | PATCH /api/household/members/[id] promotes member to co-owner (owner only) |
| T20 | POST /api/household/transfer transfers ownership correctly |
| T21 | DELETE /api/household deletes household, clears household_id from members |
| T22 | Leaving household clears user's household_members row |
| T23 | Recipes added before leaving remain in household vault |
| T24 | Recipes added after leaving are personal (no household_id) |
| T25 | Household settings page shows member list with roles |
| T26 | Invite link renders join prompt with household name and member count |
| T27 | Declining invite redirects to home as solo user |

---

## Out of Scope

- Household recipe collections / folders (separate from personal)
- Per-member dietary preferences within a household
- Household activity feed (who added what)
- Notifications when household data changes
- Multiple households per user
- Household billing / subscription tiers
- Guest access (view-only without an account)
- Household chat or comments on recipes
