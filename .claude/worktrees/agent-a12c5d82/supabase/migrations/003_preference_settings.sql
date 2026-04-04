-- Brief 03: Preference Settings

-- 2a. Alter user_preferences: replace weekly_tag_caps with limited_tags
alter table user_preferences
  drop column if exists weekly_tag_caps,
  add column if not exists limited_tags jsonb not null default '[]';
  -- shape: [{ "tag": "Comfort", "cap": 2 }, ...]

-- 2b. Add onboarding_completed flag
alter table user_preferences
  add column if not exists onboarding_completed bool not null default false;

-- 2c. Seed default preferences on signup via DB trigger
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
    onboarding_completed
  ) values (
    new.id,
    3,
    28,
    true,
    '{}',
    '{}',
    '[]',
    false
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it already exists before recreating
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
