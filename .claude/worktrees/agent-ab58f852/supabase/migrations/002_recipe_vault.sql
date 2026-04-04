-- Alter recipes table to add new columns
alter table recipes
  add column is_shared    bool    default false,
  add column ingredients  text,
  add column steps        text,
  add column image_url    text;

-- Prevent duplicate log entries for the same recipe on the same day
alter table recipe_history
  add constraint recipe_history_unique_day
  unique (recipe_id, user_id, made_on);

-- Enable RLS
alter table recipes        enable row level security;
alter table recipe_history enable row level security;

-- Owners have full access to their own recipes
create policy "owner full access"
  on recipes for all
  using (auth.uid() = user_id);

-- Any authenticated user can read shared recipes
create policy "read shared recipes"
  on recipes for select
  using (is_shared = true);

-- Owners have full access to their own history
create policy "owner history access"
  on recipe_history for all
  using (auth.uid() = user_id);
