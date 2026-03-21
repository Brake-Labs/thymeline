create table grocery_lists (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  meal_plan_id  uuid not null references meal_plans(id) on delete cascade,
  week_start    date not null,
  people_count  int not null default 2,
  recipe_scales jsonb not null default '[]',
  items         jsonb not null default '[]',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(user_id, week_start)
);

alter table grocery_lists enable row level security;

create policy "owner full access"
  on grocery_lists for all
  using (auth.uid() = user_id);
