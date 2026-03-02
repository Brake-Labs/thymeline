# Forkcast — Agent Instructions

Forkcast is an AI-powered weekly meal planning app built with Next.js (TypeScript),
Tailwind CSS, and Supabase. Users store recipes, get LLM-assisted meal suggestions
based on preferences, generate grocery lists, and track what they've cooked.

## Repo Structure
- `main` — production, never commit directly
- `staging` — integration, agents merge here via PR only
- `feature/*` — all agent work happens here

## Tech Stack
- **Frontend:** Next.js 14+ with TypeScript, Tailwind CSS
- **Backend:** Next.js API routes
- **Database:** Supabase (Postgres)
- **LLM routing:** any-llm (swap between Claude, GPT, etc.)
- **Auth:** Supabase Auth

## Core Data Models

### users
Managed by Supabase Auth.

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
