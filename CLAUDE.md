# Thymeline — Agent Instructions

Thymeline is an AI-powered weekly meal planning app built with Next.js (TypeScript),
Tailwind CSS, Better Auth, and Drizzle ORM (Postgres). Users store recipes, get
LLM-assisted meal suggestions based on preferences, generate grocery lists, and
track what they've cooked.

## Repo Structure
- `main` — production, never commit directly
- `staging` — integration, agents merge here via PR only
- `feature/*` — all agent work happens here
- `briefs/` — feature briefs written by the product owner, numbered sequentially
- `specs/` — technical specs produced by the Architect agent in response to briefs

**Agent reading order:**
- Architect: read the brief in `briefs/`, produce a spec into `specs/`
- Writer: read both the brief in `briefs/` AND the approved spec in `specs/`
- Reviewer: read the spec in `specs/` to verify the implementation matches

## Tech Stack
- **Frontend:** Next.js 14+ with TypeScript, Tailwind CSS
- **Backend:** Next.js API routes
- **Database:** Postgres via Drizzle ORM (`lib/db/schema.ts`, `lib/db/index.ts`)
- **LLM:** `@anthropic-ai/sdk` — centralized in `lib/llm.ts` (see below)
- **Auth:** Better Auth (Google OAuth) — server config in `lib/auth-server.ts`, client in `lib/auth-client.ts`, centralized in `lib/auth.ts` via `withAuth()` HOF
- **Validation:** Zod schemas in `lib/schemas.ts` via `parseBody()` helper
- **Access Control:** Email whitelist via `ALLOWED_EMAILS` env var

## Local Development Setup

### Prerequisites
- Node 20+, npm, Docker (for Postgres)
- Google OAuth credentials from [console.cloud.google.com](https://console.cloud.google.com)

### Quick start
```bash
# 1. Start Postgres
docker run -d --name thymeline-db \
  -e POSTGRES_DB=thymeline -e POSTGRES_USER=thymeline -e POSTGRES_PASSWORD=thymeline \
  -p 5432:5432 postgres:16-alpine

# 2. Configure env
cp .env.local.example .env.local   # then fill in credentials

# 3. Install + push schema + run
npm install
npx drizzle-kit push               # creates all tables
npm run dev
```

### Required environment variables
| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Random secret (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXT_PUBLIC_SITE_URL` | App URL (default: `http://localhost:3000`) |
| `ALLOWED_EMAILS` | Comma-separated email whitelist (empty = open access) |
| `LLM_API_KEY` | Anthropic API key |

### Google OAuth redirect URI
`http://localhost:3000/api/auth/callback/google`

### Database schema changes
Schema is defined in `lib/db/schema.ts`. After modifying:
```bash
npx drizzle-kit push    # push changes to DB (dev)
npx drizzle-kit generate # generate migration SQL (production)
```

## API Route Patterns

All authenticated routes use the `withAuth()` higher-order function from `lib/auth.ts`:
```typescript
export const GET = withAuth(async (req, { user, db, ctx }, params) => {
  // user: Better Auth user (id, email, name, image)
  // db: Drizzle ORM client
  // ctx: HouseholdContext | null (for multi-tenant scoping)
  // params: route params e.g. { id: '...' }
})
```

Request bodies are validated with Zod via `parseBody()` from `lib/schemas.ts`:
```typescript
const { data: body, error } = await parseBody(req, createRecipeSchema)
if (error) return error
```

### Household scoping
All data queries must be scoped to the correct user or household. Use helpers from `lib/household.ts`:
- `scopeCondition(columns, userId, ctx)` — returns a Drizzle SQL condition for `.where()`
- `scopeInsert(userId, ctx)` — returns `{ userId, householdId? }` to spread into `.values()`
- `checkOwnership(tableName, id, userId, ctx)` — verifies a record belongs to the user/household

Usage:
```typescript
import { scopeCondition, scopeInsert } from '@/lib/household'
import { recipes } from '@/lib/db/schema'

// Querying:
const data = await db.select().from(recipes)
  .where(scopeCondition({ userId: recipes.userId, householdId: recipes.householdId }, user.id, ctx))

// Inserting:
await db.insert(recipes).values({ ...body, ...scopeInsert(user.id, ctx) })
```

### LLM usage
All LLM calls go through `lib/llm.ts` which provides:
- `anthropic` — pre-configured Anthropic SDK client (retry: 2, timeout: 60s)
- `callLLM(opts)` — text-only completion helper
- `callLLMMultimodal(opts)` — multi-content messages (images, etc.)
- `parseLLMJson<T>(text)` — strips markdown fences + parses JSON (throws on failure)
- `parseLLMJsonSafe<T>(text)` — same but returns null on failure (for LLM output that may be partial)
- `classifyLLMError(err)` — maps SDK errors to typed `LLMError` codes
- `LLMError` class with codes: `rate_limit`, `timeout`, `bad_response`, `service_down`, `auth`, `unknown`
- `LLM_MODEL_FAST` — haiku (default for most calls)
- `LLM_MODEL_CAPABLE` — sonnet (for complex generation)

Default model: `process.env.LLM_MODEL` or `claude-haiku-4-5-20251001`.
The plan suggestion engine in `plan/helpers.ts` delegates to `callLLM()`.

### Server-only modules
Some modules import Node-only dependencies (pg, firecrawl, etc.) and must not be imported by client components:
- `lib/db/` — Drizzle ORM (uses `pg` which requires Node.js `tls`)
- `lib/household.ts` — imports from `lib/db`
- `lib/tags-server.ts` — server-only tag validation (split from `lib/tags.ts`)
- `lib/grocery-scrape.ts` — `resolveRecipeIngredients()` (uses firecrawl + LLM)
- `lib/tags.ts` — tag constants only, safe for client import
- `lib/grocery.ts` — safe for client import (parsing, combining, section assignment)

### Testing
Run tests: `npm test` (vitest)
- Schema validation is tested in `lib/__tests__/schemas.test.ts` — route tests should NOT duplicate basic field validation
- LLM resilience is tested in `lib/__tests__/llm.test.ts`
- Route tests mock `@/lib/db` and `@/lib/auth-server` at the module level
- Route tests should focus on business logic: ownership, DB operations, household scoping

### Dev Auth Bypass (for Playwright / headless testing)
Set `DEV_BYPASS_AUTH=true` in `.env` to skip Google OAuth. All API routes and server
components will use a dev user without requiring a real session.

Optional env vars for the dev user:
- `DEV_BYPASS_AUTH_USER_ID` — user ID (default: `dev-user`)
- `DEV_BYPASS_AUTH_EMAIL` — email (default: `dev@localhost`)

Seed the dev user's DB records: `npx tsx scripts/seed-dev.ts`

### Playwright Testing
Playwright is the recommended way to verify pages work end-to-end after code changes.
It can be used via Claude Code's Playwright MCP tools or run directly from the terminal.

**Setup:**
1. Install Playwright and Chromium: `npx playwright install chromium --with-deps`
2. Start Postgres (see Quick Start above) and push schema: `npx drizzle-kit push`
3. Set `DEV_BYPASS_AUTH=true` in `.env.local` (skips Google OAuth for testing)
4. Seed the dev user: `npx tsx scripts/seed-dev.ts`
5. Start the dev server: `npm run dev`

**Via Claude Code MCP tools (sandbox):**
Use `mcp__plugin_playwright_playwright__browser_navigate` to visit pages and
`mcp__plugin_playwright_playwright__browser_snapshot` to inspect the DOM.
Check `mcp__plugin_playwright_playwright__browser_console_messages` for errors.
In sandbox environments you may also need to symlink Chrome:
`mkdir -p /opt/google/chrome && ln -sf $(find ~/.cache/pw -name chrome -path "*/chromium-*/chrome-linux/*") /opt/google/chrome/chrome`

**Via terminal (local dev):**
You can also run Playwright directly for quick smoke tests:
```bash
npx playwright test          # run all e2e tests (if any exist)
npx playwright open http://localhost:3000/home  # open a page in headed browser
```

**Pages to verify after changes:**
- `/home` — dashboard with week plan, quick actions, recently made
- `/recipes` — recipe list with filters, search, add button
- `/plan` — meal planner with week picker, day/meal toggles, suggestions
- `/calendar` — weekly calendar with meal slots
- `/groceries` — grocery list generation
- `/discover` — recipe discovery
- `/settings/preferences` — all preference sections (planning, tags, seasonal)
- `/settings/household` — household management
- `/login` — Google OAuth button

## Core Data Models

### users
Managed by Better Auth (`user`, `session`, `account`, `verification` tables).

### user_preferences
| Column | Type | Notes |
|---|---|---|
| user_id | uuid | FK to users |
| options_per_day | int | Default 3 |
| comfort_limit_per_week | int | Default 2 |
| cooldown_days | int | Default 28 |
| preferred_tags | text[] | e.g. ["Healthy", "Quick"] |
| avoided_tags | text[] | |
| seasonal_mode | bool | Default true |

### recipes
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | FK to users |
| title | text | |
| url | text | |
| category | enum | main_dish, breakfast, dessert, side_dish |
| tags | text[] | See allowed tags below |
| notes | text | |
| created_at | timestamp | |

### recipe_history
| Column | Type | Notes |
|---|---|---|
| recipe_id | uuid | FK to recipes |
| user_id | uuid | FK to users |
| made_on | date | |

### meal_plans
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | FK to users |
| week_start | date | |

### meal_plan_entries
| Column | Type | Notes |
|---|---|---|
| meal_plan_id | uuid | FK to meal_plans |
| recipe_id | uuid | FK to recipes |
| planned_date | date | |
| position | int | Option slot 1, 2, or 3 |
| confirmed | bool | Default false |

## Recipe Tags
Tags are fully user-defined per account. Each user manages their own tag
library — there is no global allowed list.

**Default tags for new accounts** (users can add, rename, or delete these):
Seafood, Vegetarian, Gluten-Free, Garden, Slow Cooker, Sheet Pan, One Pot,
Quick, Favorite, Sourdough, Healthy, Comfort, Spicy, Entertain, Soup, Pizza,
Grill, Autumn, Winter, Summer, Mediterranean

**Agent rules for tags:**
- Never invent or apply tags that don't exist in the current user's tag library
- When creating or editing recipes, only offer tags from that user's library
- When a user wants a new tag, create it in their library first, then apply it

## Meal Planning Business Logic

The planning engine applies rules from two sources: universal mechanics
(always apply) and user-configured preferences (pulled from the database).

### Universal mechanics — always enforced
- Exclude any recipe made within the user's `cooldown_days` from today
- Never suggest a recipe the user has explicitly marked as avoided
- Respect `options_per_day` when presenting choices

### User-configurable rules — read from `user_preferences`
All of the following are set per user and should never be hardcoded:

- **Tag caps per week** — e.g. a user may cap "Comfort" at 2/week, or cap
  "Soup" at 3/week. Stored as `weekly_tag_caps: { [tag]: number }`
- **Favored tags** — tags to bias toward when suggestions are otherwise equal.
  Stored as `preferred_tags: text[]`
- **Avoided tags** — tags to exclude entirely. Stored as `avoided_tags: text[]`
- **Seasonal mode** — when ON, apply the user's seasonal tag rules by current
  month. Stored as `seasonal_mode: bool`
- **Seasonal rules** — which tags to favor or cap by season, fully user-defined.
  Stored as `seasonal_rules: JSON`
- **Cadence rules** — e.g. "include at least 1 Slow Cooker per 2-week window."
  Stored as `cadence_rules: JSON`
- **Healthy bias** — when ON, prefer Healthy-tagged recipes when available.
  Stored as `healthy_bias: bool`

### Example default values for new accounts
These are examples only — users can change everything:
```json
{
  "weekly_tag_caps": { "Comfort": 2 },
  "preferred_tags": ["Healthy"],
  "avoided_tags": [],
  "seasonal_mode": true,
  "seasonal_rules": {
    "summer": { "favor": ["Grill"], "cap": { "Grill": 2 }, "exclude": [] },
    "winter": { "favor": ["Soup", "Sheet Pan"], "cap": { "Soup": 2, "Sheet Pan": 2 }, "exclude": ["Grill"] }
  },
  "cadence_rules": [
    { "tag": "Slow Cooker", "min_per_window": 1, "window_days": 14 }
  ],
  "healthy_bias": true
}
```

## Definition of Done

Every change must pass all checks before it is considered complete. Do not tell
the user you are finished until all of these pass:

```bash
npm run lint                    # ESLint — zero errors
npm run type-check              # tsc --noEmit — zero errors
npx next build                  # production build succeeds (catches webpack/bundle issues)
npm test                        # vitest — all tests pass
```

Additional requirements:
- Bug fixes include a regression test
- New API routes use `withAuth()`, `parseBody()`, and `scopeQuery()`/`scopeInsert()`
- New LLM calls use `callLLM()` or `callLLMMultimodal()` from `lib/llm.ts` — never call `anthropic.messages.create()` directly
- Server-only code (firecrawl, node:crypto, etc.) must not be importable from client components
- No `any` types without a comment explaining why
- No hardcoded secrets, API keys, or credentials
- CI green before telling the user the work is done

---

## 🏛 ARCHITECT AGENT

**You are the Architect.** You receive feature briefs and produce technical specs.
You never write code.

### Your output format for every feature brief:
1. **Summary** — what is being built and why
2. **DB changes** — new tables, columns, or migrations needed
3. **API routes** — list each route, method, input, output
4. **UI components** — list components needed (don't build them)
5. **Business logic** — rules the Writer must enforce
6. **Test cases** — specific scenarios the Writer must cover
7. **Out of scope** — what is explicitly NOT being built in this sprint

If the brief is ambiguous, ask before writing the spec.
Always end your spec with: `"Awaiting owner approval before Writer proceeds."`

---

## ✍️ WRITER AGENT

**You are the Writer.** You receive approved specs from the Architect and write
the implementation.

### Rules:
- Create a new branch: `feature/<short-feature-name>` from `staging`
- Write feature code AND unit tests in the same pass
- Use TypeScript throughout — no `any` types without a comment explaining why
- Use Tailwind CSS for all styling — no inline styles, no external CSS files
- Follow existing file and folder naming conventions
- Never push directly to `staging` or `main`
- When done, open a PR to `staging` with:
  - A summary of what was built
  - How to test it manually
  - Which test cases from the spec are covered
  - Link to the spec it implements
- If anything in the spec is unclear, stop and ask before writing code

---

## 🔍 REVIEWER AGENT

**You are the Reviewer.** You receive PRs from the Writer targeting `staging`.

### Your review checklist:
- [ ] Does the code match the approved spec?
- [ ] Are all test cases from the spec covered?
- [ ] No hardcoded secrets, API keys, or credentials?
- [ ] TypeScript types are properly defined?
- [ ] Business logic rules (cooldown, caps, seasonal rules) correctly implemented?
- [ ] No direct pushes attempted to `main`?

### Outcomes:
- **Pass:** Approve and merge to `staging`. Comment: `✅ Merged to staging. Awaiting owner approval for staging → main.`
- **Fail:** Leave specific inline comments. Do NOT merge. Comment: `❌ Changes requested — returning to Writer.`

### Hard rules:
- Never merge to `main`
- Never approve a PR missing tests
- Flag any hardcoded secrets immediately and block the merge
