# Brief 04 — Auth & Home Screen

**Type:** Feature (send to Architect first, then Writer)
**Branch:** `feature/auth`
**Target:** PR into `staging`
**Depends on:** Brief 01 (scaffold) merged to staging

---

## User Story
As a Forkcast user, I want to sign in securely and land on a home screen
that gives me a clear overview of my week and quick access to everything
I need — so I can get to planning or cooking without hunting around.

---

## Auth Model

### Supported login methods
- **Magic link** — user enters email, receives a one-time login link
- **Google OAuth** — sign in with Google account

### Who can sign up
- **Invite-only.** New accounts can only be created via a unique invite link
  you generate and send manually. Anyone without an invite link cannot create
  an account, even if they have a valid email.

### Invite link model
- You (the admin) generate invite links from a simple admin route
- Each invite link is single-use and expires after 7 days
- When a new user clicks an invite link and signs up successfully, the invite
  is marked as used and cannot be reused
- If a user tries to sign up without a valid invite link, show a friendly
  error: "Forkcast is invite-only. Ask for an invite link to get started."

### Auth flow
1. Unauthenticated user visits any app route → redirect to `/login`
2. User signs in via magic link or Google
3. After successful auth:
   - New user (onboarding_completed = false) → redirect to `/onboarding`
   - Returning user (onboarding_completed = true) → redirect to `/home`
4. User can sign out from any page via nav

---

## Screens

### 1. Login Page (`/login`)

**Full Forkcast branding.** This is the first thing new users see — it should
feel polished and intentional.

**Design elements:**
- Forkcast logo (text-based wordmark is fine for now — use a distinctive
  font treatment, not just plain text)
- Tagline: "Your AI-powered meal planning assistant"
- Two sign-in options presented cleanly:
  - Magic link: email input + "Send me a link" button
  - Google: "Continue with Google" button with Google icon
- Divider between the two options: "or"
- After magic link is sent: replace the form with a confirmation message:
  "Check your email — we sent you a sign-in link."
- Error state: show inline error message if auth fails
- No sign-up form — new users arrive via invite link which pre-populates
  the auth flow

**Visual direction:**
- Warm, food-forward palette — think earthy greens, warm whites, soft oranges
- Not clinical or sterile — this is a kitchen tool, not a SaaS dashboard
- Centered card layout on desktop, full-screen on mobile
- Subtle food-related illustration or pattern in the background (CSS only,
  no image assets needed for v1 — could be a subtle geometric pattern
  suggesting a cutting board or tile)

### 2. Home Screen (`/home`)

The landing page for returning authenticated users. Functional and
scannable — not a dashboard full of charts, just a clear overview and
quick actions.

**Sections:**

**This Week**
- Shows the current meal plan for the current week (if one exists)
- Displays planned meals by day in a simple list or card format
- If no plan exists yet: show a prompt "No plan yet this week —
  want to plan your meals?" with a button linking to Help Me Plan
- "View full plan" link to the full meal plan page (future brief)

**Quick Actions** (large, tappable cards — mobile-friendly)
- "Help Me Plan" → `/plan` (future brief)
- "Recipe Vault" → `/recipes`
- "Settings" → `/settings/preferences`

**Recently Made**
- Last 3 recipes logged in `recipe_history` for this user
- Each shows recipe name + date made
- "View all" link to `/recipes` (filtered by history — future enhancement)
- If no history yet: hide this section entirely

**Navigation:**
- Persistent top nav (or bottom nav on mobile) with:
  - Forkcast logo/wordmark (links to `/home`)
  - Recipes
  - Plan
  - Settings
  - Sign out

---

## Invite System

### DB table: `invites`
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

### Admin route: `GET /api/admin/invite`
- Only callable by you (check `auth.uid()` against a hardcoded admin UUID
  stored in an env var `ADMIN_USER_ID`)
- Generates a new invite token (random UUID or short token)
- Sets `expires_at` to 7 days from now
- Returns the full invite URL:
  `https://yourapp.com/invite?token=<token>`
- Return `403` if caller is not admin

### Invite validation: `GET /api/invite/validate?token=<token>`
- Checks the token exists, is not used, and is not expired
- Returns `{ valid: boolean, reason?: string }`
- Does not consume the token

### Invite consumption
- After a new user successfully signs up (Supabase auth callback), call
  `POST /api/invite/consume` with `{ token, user_id }`
- Marks the invite as used (`used_by`, `used_at`)
- If no valid token is present during signup, the user's account should
  be immediately disabled or deleted — Forkcast is invite-only

### Invite link flow
1. User receives link: `https://yourapp.com/invite?token=abc123`
2. Visiting the link validates the token server-side
3. If valid: redirect to `/login?invite=abc123` (token passed as query param)
4. Login page stores the token in session storage
5. After successful auth, consume the invite token for the new user
6. If token is invalid or expired: show error page with message
   "This invite link is invalid or has expired. Ask for a new one."

---

## App Layout & Route Protection

### Authenticated layout (`app/(app)/layout.tsx`)
- Verifies Supabase session server-side
- If no session → redirect to `/login`
- If session + `onboarding_completed = false` → redirect to `/onboarding`
  (unless already on `/onboarding`)
- If session + `onboarding_completed = true` → render children normally

### Public routes (no auth required)
- `/login`
- `/invite` (token validation landing)
- `/auth/callback` (Supabase OAuth callback handler)

---

## Environment Variables
Add to `.env.local.example`:
```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ADMIN_USER_ID=
```

`NEXT_PUBLIC_SITE_URL` is used to construct invite URLs.
`ADMIN_USER_ID` is your Supabase user UUID — set this after your first login.

---

## Out of Scope
- Email/password auth (magic link + Google only)
- Password reset flow
- Account deletion
- Profile editing (name, avatar)
- Multi-admin invite management UI
- Invite expiry extension
- Social features / following other users

---

## Test Cases
- [ ] Unauthenticated user visiting `/recipes` is redirected to `/login`
- [ ] Magic link email is sent when user submits valid email
- [ ] Confirmation message shown after magic link sent
- [ ] Google OAuth completes and redirects correctly
- [ ] New user (onboarding_completed = false) lands on `/onboarding` after login
- [ ] Returning user (onboarding_completed = true) lands on `/home` after login
- [ ] `/home` shows current week's meal plan if one exists
- [ ] `/home` shows "No plan yet" prompt if no meal plan exists
- [ ] `/home` shows last 3 recently made recipes
- [ ] `/home` hides Recently Made section if no history
- [ ] All 3 quick action cards link to correct routes
- [ ] Sign out clears session and redirects to `/login`
- [ ] Valid invite link redirects to `/login?invite=<token>`
- [ ] Invalid/expired invite link shows error page
- [ ] Invite token is consumed after successful signup
- [ ] User without valid invite token cannot complete signup
- [ ] `GET /api/admin/invite` returns invite URL for admin user
- [ ] `GET /api/admin/invite` returns 403 for non-admin user
- [ ] Nav renders correctly on mobile (bottom nav or hamburger)

---

## How to Hand This to the Architect

Paste this entire brief into your Forkcast Architect session in AOE with
this message prepended:

> "You are the Forkcast Architect agent. Read CLAUDE.md in the root of
> this repo for your full instructions. Then read
> briefs/brief-04-auth.md and produce a full technical spec for the
> Writer agent to implement. Ask me if anything is ambiguous before
> writing the spec."
