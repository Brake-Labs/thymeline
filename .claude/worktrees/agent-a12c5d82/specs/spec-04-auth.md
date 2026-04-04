# Technical Spec — Brief 04: Auth & Home Screen

**Spec status:** Draft — Awaiting owner approval before Writer proceeds.
**Branch:** `feature/auth` from `staging`
**Depends on:** `feature/scaffold` merged to `staging`

---

## 1. Summary

Add authentication (magic link + Google OAuth), an invite-only signup gate, and
the home screen. Unauthenticated users are redirected to `/login`. New users who
complete auth without a valid invite are marked inactive and blocked at the app
layout. Returning users land on `/home`, which shows the current week's meal plan
and recent cook history.

---

## 2. DB Changes

### 2a. Add `is_active` to `user_preferences`

```sql
alter table user_preferences
  add column if not exists is_active bool not null default true;
```

When a user completes signup without a valid invite token, `is_active` is set
to `false` server-side. The app layout blocks all `(app)` routes for inactive
users and shows an error page.

`is_active` is **not** exposed as a patchable field via `PATCH /api/preferences`
— it can only be written internally by `POST /api/invite/consume`.

### 2b. Update `handle_new_user` trigger

The trigger introduced in spec-03 must include `is_active = true` in the default
row. Replace or update the trigger body:

```sql
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.user_preferences (
    user_id,
    options_per_day,
    cooldown_days,
    seasonal_mode,
    preferred_tags,
    avoided_tags,
    limited_tags,
    onboarding_completed,
    is_active
  ) values (
    new.id,
    3,
    28,
    true,
    '{}',
    '{}',
    '[]',
    false,
    true   -- provisionally active; set to false by consume route if no valid invite
  );
  return new;
end;
$$ language plpgsql security definer;
```

### 2c. Create `invites` table

```sql
create table invites (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  created_by  uuid references auth.users(id),
  used_by     uuid references auth.users(id),
  used_at     timestamptz,
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);
```

### 2d. RLS on `invites`

```sql
alter table invites enable row level security;

-- Anyone (including unauthenticated) can read invites.
-- Tokens are random and unguessable, so public read is safe in practice.
create policy "public can read invites"
  on invites for select
  using (true);

-- Any authenticated user can insert invites.
-- Admin enforcement happens in the API route, not at DB level.
create policy "authenticated can insert invites"
  on invites for insert
  to authenticated
  with check (true);

-- A user can only mark an invite as consumed for themselves,
-- and only if it hasn't been used and hasn't expired.
create policy "user can consume their invite"
  on invites for update
  to authenticated
  using  (used_by is null and expires_at > now())
  with check (used_by = auth.uid());
```

> **Architect note:** The insert policy allows any authenticated user to insert
> invite rows if they bypass the API route. Without a service role key, this is
> the practical tradeoff. The `POST /api/admin/invite` route enforces the admin
> check at the application layer. Acceptable for a small invite-only product.

### 2e. Update TypeScript types in `types/index.ts`

Add `is_active` to `UserPreferences`:
```typescript
is_active: boolean
```

Add new types:
```typescript
export interface Invite {
  id:         string
  token:      string
  created_by: string | null
  used_by:    string | null
  used_at:    string | null
  expires_at: string
  created_at: string
}

export interface HomeData {
  currentWeekPlan: {
    id:      string
    week_start: string
    entries: {
      planned_date: string
      recipe_id:    string
      recipe_title: string
      position:     number
      confirmed:    boolean
    }[]
  } | null
  recentlyMade: {
    recipe_id:    string
    recipe_title: string
    made_on:      string
  }[]
}
```

### 2f. New env vars

Add to `.env.local.example`:
```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_USER_ID=
```

- `NEXT_PUBLIC_SITE_URL` — used to construct invite URLs. Required.
- `ADMIN_USER_ID` — the admin's Supabase user UUID. Set this after first login.
  The `POST /api/admin/invite` route returns `403` if this env var is not set.

---

## 3. Route Structure

### New public routes (no auth required)

| Route | File | Notes |
|---|---|---|
| `/login` | `app/(auth)/login/page.tsx` | Magic link + Google sign-in |
| `/invite` | `app/(auth)/invite/page.tsx` | Invite token validation landing |
| `/inactive` | `app/(auth)/inactive/page.tsx` | Blocked account error page |
| `/auth/callback` | `app/auth/callback/route.ts` | Supabase OAuth/magic link callback |
| `/auth/complete` | `app/auth/complete/page.tsx` | Client-side post-auth processing |

These routes are outside the `(app)` route group and do not go through the
authenticated layout.

### Updated authenticated layout

`app/(app)/layout.tsx` — expand the existing layout check from spec-03:

```
Session absent              → redirect to /login
Session + is_active = false → redirect to /inactive
Session + is_active = true
  + onboarding_completed = false → redirect to /onboarding (unless already there)
  + onboarding_completed = true  → render children
```

Fetch preferences once per layout render via `GET /api/preferences`.

### New authenticated route

| Route | File | Notes |
|---|---|---|
| `/home` | `app/(app)/home/page.tsx` | Home screen |

---

## 4. Auth Flow

### Magic link flow

1. User visits `/invite?token=abc123`
2. `GET /api/invite/validate?token=abc123` is called server-side during page render
3. If invalid/expired: render error page (no redirect needed — the `/invite` page renders the error inline)
4. If valid: redirect to `/login?invite=abc123`
5. Login page reads `invite` query param on mount and saves to `sessionStorage['forkcast_invite_token']`
6. User enters email, clicks "Send me a link"
7. Supabase sends magic link to email
8. Login page replaces form with confirmation message
9. User clicks magic link in email → browser navigates to `/auth/callback?code=...`
10. `/auth/callback` exchanges code for session, redirects to `/auth/complete`
11. `/auth/complete` (client page) handles post-auth logic (see §4 below)

### Google OAuth flow

Steps 1–5 are identical. Then:
6. User clicks "Continue with Google"
7. Supabase initiates OAuth redirect to Google
8. Google redirects back to `/auth/callback?code=...`
9. `/auth/callback` exchanges code for session, redirects to `/auth/complete`
10. `/auth/complete` handles post-auth logic

### `/auth/complete` post-auth logic

This is a `'use client'` page. On mount:

```
1. Call supabase.auth.getUser() to get current user
2. Fetch GET /api/preferences
3. If onboarding_completed = true:
     → redirect to /home (returning user, skip invite check)
4. If onboarding_completed = false (new user):
     a. Read token = sessionStorage.getItem('forkcast_invite_token')
     b. Call POST /api/invite/consume with { token } (token may be null)
     c. If consume returns { success: true }:
          - sessionStorage.removeItem('forkcast_invite_token')
          - redirect to /onboarding
     d. If consume returns { success: false }:
          - redirect to /inactive
```

Show a neutral loading state ("Getting things ready…") while this runs.

---

## 5. API Routes

All routes except `GET /api/invite/validate` require an authenticated session.
Return `401` if no session unless noted.

---

### `POST /api/admin/invite`

**Purpose:** Generate a new single-use invite link. Admin only.

**Auth:** Requires authenticated session. Check `auth.uid()` against
`process.env.ADMIN_USER_ID`. Return `403` if they don't match or if
`ADMIN_USER_ID` is not set.

**No request body required.**

**Behavior:**
1. Verify admin identity.
2. Generate a new token: `crypto.randomUUID()`.
3. Set `expires_at = now() + 7 days`.
4. Insert into `invites` with `created_by = auth.uid()`.
5. Return the full invite URL.

**Response:**
```typescript
{
  invite_url: string  // e.g. "https://yourapp.com/invite?token=<token>"
  expires_at: string  // ISO timestamp
}
```

**Errors:** `403` if not admin.

---

### `GET /api/invite/validate?token=<token>`

**Purpose:** Check whether an invite token is valid. No auth required.

**Behavior:**
1. Look up the token in `invites`.
2. Valid if: exists, `used_by` is null, `expires_at > now()`.

**Response:**
```typescript
{
  valid:   boolean
  reason?: string  // present when valid = false
                   // "Token not found" | "Already used" | "Expired"
}
```

Always returns `200` — never `404` for missing tokens (avoids enumeration).

---

### `POST /api/invite/consume`

**Purpose:** Mark an invite as used after successful signup. Authenticated.
Also sets `is_active = false` if the token is missing or invalid.

**Input:**
```typescript
{ token: string | null }
```

**Behavior:**
1. Verify user is authenticated.
2. If `token` is null or empty:
   - Update `user_preferences` set `is_active = false` for `auth.uid()`
   - Return `{ success: false, reason: "No invite token" }`
3. Look up token in `invites`:
   - Not found → set `is_active = false`, return `{ success: false, reason: "Token not found" }`
   - Already used → set `is_active = false`, return `{ success: false, reason: "Already used" }`
   - Expired → set `is_active = false`, return `{ success: false, reason: "Expired" }`
4. If valid: update the invite row (`used_by = auth.uid()`, `used_at = now()`).
   Return `{ success: true }`.

**Response:**
```typescript
{ success: boolean, reason?: string }
```

Always returns `200`. The client decides where to redirect based on `success`.

---

### `GET /api/home`

**Purpose:** Return data needed to render the home screen.

**Behavior:**
1. Determine the current week start (Monday of the current week, ISO date).
2. Query `meal_plans` for a row matching `user_id = auth.uid()` and `week_start = <current week start>`.
3. If found: join `meal_plan_entries` and `recipes` to get entry details.
4. Query `recipe_history` for the 3 most recent `made_on` dates for `auth.uid()`, joined with `recipes` for the title.

**Response:** `HomeData` (defined in §2e above). `currentWeekPlan` is `null` if no plan exists this week. `recentlyMade` is an empty array if no history exists.

---

## 6. UI Components

All TypeScript. All Tailwind — no inline styles, no external CSS.

---

### `app/(auth)/login/page.tsx`

**Visual spec:**
- Centered card layout on desktop (`max-w-sm`, `mx-auto`, generous vertical padding)
- Full-screen on mobile
- Background: warm off-white (`bg-stone-50`) with a subtle repeating CSS tile
  pattern suggesting a cutting board — implement as a `before:` pseudo-element
  or `bg-[url(...)]` using an inline SVG data URI of simple grid lines in
  `stone-200`. Keep it very subtle (low opacity).
- Wordmark: "Forkcast" in a heavy weight (`font-black`), wide tracking
  (`tracking-tight`), warm color (`text-stone-800`). A fork icon (Unicode ⑂ or
  an inline SVG) to the left of the text is acceptable.
- Tagline: `text-stone-500 text-sm`

**Form states:**
1. **Default:** Email input + "Send me a link" button (primary, warm green:
   `bg-emerald-700 hover:bg-emerald-800 text-white`) + `"or"` divider +
   "Continue with Google" button (outlined, with Google SVG icon)
2. **Loading:** Disable both buttons, show spinner inside the active button
3. **Confirmation (after magic link sent):** Hide the entire form; show:
   `"Check your email — we sent you a sign-in link."` in a subtle success box
4. **Error:** Inline error message below the relevant button in `text-red-600 text-sm`

**On mount:**
- Read `invite` query param; if present, `sessionStorage.setItem('forkcast_invite_token', token)`

**Magic link implementation:**
```typescript
supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: `${NEXT_PUBLIC_SITE_URL}/auth/callback` }
})
```

**Google OAuth implementation:**
```typescript
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${NEXT_PUBLIC_SITE_URL}/auth/callback` }
})
```

---

### `app/(auth)/invite/page.tsx`

Server component. Reads `token` from query params, calls
`GET /api/invite/validate?token=<token>` during render.

- **Valid token:** Redirect immediately to `/login?invite=<token>` (use
  `redirect()` from `next/navigation`).
- **Invalid/expired token:** Render a simple centered error card:
  `"This invite link is invalid or has expired. Ask for a new one."`
  No links or CTAs — just the message and the Forkcast wordmark.

---

### `app/(auth)/inactive/page.tsx`

Simple centered card. No navigation.

Content:
- Forkcast wordmark
- Heading: `"Account not active"`
- Body: `"Forkcast is invite-only. Ask for an invite link to get started."`
- No sign-out button needed — the user has a valid session, just no invite.

---

### `app/auth/callback/route.ts`

Server-side route handler. Standard Supabase PKCE callback:

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(new URL('/auth/complete', request.url))
}
```

Always redirects to `/auth/complete` regardless of outcome — let the client
page handle error cases.

---

### `app/auth/complete/page.tsx`

`'use client'`. Runs the post-auth logic described in §4. Renders only a
neutral loading state (`"Getting things ready…"` centered on screen) while
processing. Never shows an error inline — all failure paths redirect.

---

### `app/(app)/home/page.tsx`

Server component. Fetches `GET /api/home`.

**Layout (single column, mobile-first):**

**This Week section:**
- Heading: "This Week"
- If `currentWeekPlan` exists: list entries grouped by `planned_date`, showing
  recipe title and whether confirmed. Format date as "Mon Mar 2", etc.
- If `null`: prompt card — `"No plan yet this week"` + `"Help Me Plan"` button
  linking to `/plan`
- "View full plan" link (rendered even when plan exists) linking to `/plan`

**Quick Actions section:**
- Heading: "Quick Actions"
- Three large tappable cards in a grid (`grid-cols-1 sm:grid-cols-3`):
  - "Help Me Plan" → `/plan`
  - "Recipe Vault" → `/recipes`
  - "Settings" → `/settings/preferences`
- Cards: `rounded-xl border border-stone-200 p-6 hover:bg-stone-50` with an
  icon (Unicode or inline SVG) and label. Large touch target.

**Recently Made section:**
- Heading: "Recently Made"
- If `recentlyMade` is empty: **hide this section entirely** (no heading, no empty state)
- If entries exist: simple list — recipe name + formatted date
- "View all" link → `/recipes`

---

### `components/layout/AppNav.tsx`

Persistent navigation rendered by `app/(app)/layout.tsx`.

**Desktop (top nav, `md:flex`):**
- Left: Forkcast wordmark → `/home`
- Right: Recipes → `/recipes` | Plan → `/plan` | Settings → `/settings/preferences` | Sign Out button

**Mobile (bottom nav, `flex md:hidden`, fixed to bottom):**
- Four icon+label tabs: Home, Recipes, Plan, Settings
- Sign out accessible via Settings tab or a menu (Writer's choice — keep it simple)

**Sign out:**
```typescript
await supabase.auth.signOut()
router.push('/login')
```

Active route: highlight the current nav item using `usePathname()`.
This is a `'use client'` component.

---

## 7. Business Logic

1. **Invite check only for new users.** The invite token check in `/auth/complete`
   only runs when `onboarding_completed = false`. Returning users skip it entirely,
   so re-authenticating users are never accidentally blocked.

2. **`is_active` is write-protected.** `PATCH /api/preferences` must not accept
   `is_active` in its input. Strip it server-side if present. It is only written
   by `POST /api/invite/consume`.

3. **`is_active` is readable.** `GET /api/preferences` should include `is_active`
   in its response so the layout can read it.

4. **Inactive users see nothing.** The `(app)` layout redirects to `/inactive`
   before rendering any page. `/inactive` is outside the `(app)` group and has
   no auth requirement.

5. **Invite tokens are single-use.** Once `used_by` is set, any further attempt
   to consume the same token returns `success: false`. The RLS update policy also
   enforces `used_by is null` at the DB level.

6. **`ADMIN_USER_ID` is not set → admin route returns 403.** The route must handle
   the missing-env-var case explicitly rather than panic.

7. **`NEXT_PUBLIC_SITE_URL` used for all redirect URLs.** Never hardcode
   `localhost` or a domain. The callback URL passed to Supabase auth methods and
   the invite URL returned by the admin route both use this env var.

8. **Home page "This Week" uses calendar week.** The current week start is
   computed as the most recent Monday (ISO week). If the user is in a locale
   where weeks start on Sunday, still use Monday — this matches how meal plans
   will be created in the planning engine.

9. **Google icon on the OAuth button.** Include the official Google "G" SVG logo
   inline (it's a small, static SVG — no external asset needed). Do not use an
   emoji or text substitute.

---

## 8. Test Cases

| # | Test case |
|---|---|
| T01 | Unauthenticated user visiting `/recipes` is redirected to `/login` |
| T02 | Magic link email is sent when user submits a valid email address |
| T03 | Confirmation message replaces the form after magic link is sent |
| T04 | Google OAuth flow completes and redirects to `/auth/complete` |
| T05 | New user (`onboarding_completed = false`) lands on `/onboarding` after auth |
| T06 | Returning user (`onboarding_completed = true`) lands on `/home` after auth |
| T07 | `/home` shows current week's meal plan entries when a plan exists |
| T08 | `/home` shows "No plan yet" prompt when no meal plan exists for current week |
| T09 | `/home` shows last 3 recently made recipes |
| T10 | `/home` hides Recently Made section entirely when no history exists |
| T11 | All 3 quick action cards link to the correct routes |
| T12 | Sign out clears session and redirects to `/login` |
| T13 | Valid invite link (`/invite?token=abc`) redirects to `/login?invite=abc` |
| T14 | Invalid/expired invite link renders error message on `/invite` page |
| T15 | Invite token is consumed (marked used) after successful new-user signup |
| T16 | New user who completes auth without a valid invite token has `is_active = false` |
| T17 | User with `is_active = false` is redirected to `/inactive` on any `(app)` route |
| T18 | `POST /api/admin/invite` returns invite URL for the admin user |
| T19 | `POST /api/admin/invite` returns `403` for a non-admin authenticated user |
| T20 | `POST /api/admin/invite` returns `403` when `ADMIN_USER_ID` env var is not set |
| T21 | Consuming the same invite token twice returns `success: false` on the second call |
| T22 | Nav renders active state correctly for the current route |
| T23 | Bottom nav is visible on mobile viewports; top nav is visible on desktop |

---

## 9. Out of Scope

- Email/password auth
- Password reset flow
- Account deletion
- Profile editing (name, avatar)
- Multi-admin invite management UI
- Invite expiry extension
- Social features / following other users

---

*Awaiting owner approval before Writer proceeds.*
