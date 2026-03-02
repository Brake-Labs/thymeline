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
