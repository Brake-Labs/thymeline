# Brief 01 — App Scaffold

**Type:** Setup (goes directly to Writer, no Architect pass needed)
**Branch:** `feature/scaffold`
**Target:** PR into `staging`

---

## What this is

Bootstrap the Forkcast application with the full tech stack connected and
verified. No user-facing features yet — just a working foundation that every
future agent can build on top of.

---

## Stack to set up

- **Framework:** Next.js 14+ with TypeScript (`app` router, not `pages`)
- **Styling:** Tailwind CSS
- **Database + Auth:** Supabase (JS client)
- **LLM routing:** any-llm package
- **Linting:** ESLint + Prettier with default Next.js config

---

## Deliverables

### 1. Next.js project initialized
- TypeScript enabled
- Tailwind CSS configured
- `app/` directory structure (not `pages/`)
- Default Next.js ESLint config

### 2. Supabase client set up
- Install `@supabase/supabase-js`
- Create `lib/supabase.ts` — exports a singleton Supabase client
- Read credentials from environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Create `.env.local.example` with those two keys (empty values)
- `.env.local` must be in `.gitignore` — never commit real credentials

### 3. Supabase database schema
Run these migrations in the Supabase SQL editor (or via migration file):

```sql
-- user_preferences
create table user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  options_per_day int default 3,
  comfort_limit_per_week int default 2,
  cooldown_days int default 28,
  preferred_tags text[] default '{}',
  avoided_tags text[] default '{}',
  seasonal_mode bool default true,
  healthy_bias bool default true,
  weekly_tag_caps jsonb default '{"Comfort": 2}',
  seasonal_rules jsonb default '{
    "summer": {"favor": ["Grill"], "cap": {"Grill": 2}, "exclude": []},
    "winter": {"favor": ["Soup", "Sheet Pan"], "cap": {"Soup": 2, "Sheet Pan": 2}, "exclude": ["Grill"]}
  }',
  cadence_rules jsonb default '[
    {"tag": "Slow Cooker", "min_per_window": 1, "window_days": 14}
  ]',
  created_at timestamptz default now()
);

-- user_tags (per-user tag library)
create table user_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

-- recipes
create table recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  url text,
  category text check (category in ('main_dish', 'breakfast', 'dessert', 'side_dish')),
  tags text[] default '{}',
  notes text,
  created_at timestamptz default now()
);

-- recipe_history
create table recipe_history (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references recipes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  made_on date not null,
  created_at timestamptz default now()
);

-- meal_plans
create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  week_start date not null,
  created_at timestamptz default now()
);

-- meal_plan_entries
create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid references meal_plans(id) on delete cascade,
  recipe_id uuid references recipes(id) on delete cascade,
  planned_date date not null,
  position int not null,
  confirmed bool default false
);
```

### 4. Folder structure
Set up the following empty folders with `.gitkeep` files so structure
is visible in the repo:

```
app/
  (auth)/         ← auth routes will go here
  (app)/          ← main app routes will go here
  api/            ← API routes
components/
  ui/             ← reusable UI primitives
  layout/         ← nav, shell, page wrappers
lib/
  supabase.ts     ← Supabase client (create this)
  llm.ts          ← any-llm client (create stub)
types/
  index.ts        ← shared TypeScript types matching DB schema
```

### 5. Type definitions
Create `types/index.ts` with TypeScript interfaces matching every table
in the schema above. Example:

```typescript
export interface Recipe {
  id: string
  user_id: string
  title: string
  url?: string
  category: 'main_dish' | 'breakfast' | 'dessert' | 'side_dish'
  tags: string[]
  notes?: string
  created_at: string
}
```

### 6. any-llm stub
- Install any-llm
- Create `lib/llm.ts` that exports a configured client
- Read model/API key from environment variables
- Add `LLM_API_KEY` and `LLM_MODEL` to `.env.local.example`

### 7. Home page placeholder
Replace the default Next.js home page with a minimal placeholder:
- Forkcast logo/name (text is fine)
- Tag line: "Your AI-powered meal planning assistant"
- No functionality yet

---

## Out of scope for this brief
- Auth UI (login/signup screens)
- Any feature screens
- Actual LLM calls
- Styling beyond Tailwind being configured

---

## Test cases
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` completes without TypeScript errors
- [ ] `lib/supabase.ts` exports a valid client
- [ ] `.env.local` is in `.gitignore`
- [ ] `.env.local.example` exists with the correct keys (empty values)
- [ ] All TypeScript interfaces in `types/index.ts` match the DB schema
- [ ] Folder structure matches spec above

---

## How to hand this to the Writer agent

Paste this entire brief into your Forkcast Writer session in AOE with
this message prepended:

> "You are the Forkcast Writer agent. Please read CLAUDE.md in this repo
> for your full instructions. Then implement the following brief exactly
> as written. Create branch `feature/scaffold` from `staging` and open
> a PR to `staging` when done."
