-- Brief 04: Auth & Home Screen

-- 2a. Add is_active to user_preferences
alter table user_preferences
  add column if not exists is_active bool not null default true;

-- 2b. Update handle_new_user trigger to include is_active
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
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger (function is already replaced above)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- 2c. Create invites table
create table if not exists invites (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  created_by  uuid references auth.users(id),
  used_by     uuid references auth.users(id),
  used_at     timestamptz,
  expires_at  timestamptz not null,
  created_at  timestamptz default now()
);

-- 2d. RLS on invites
alter table invites enable row level security;

-- Anyone (including unauthenticated) can read invites.
-- Tokens are random and unguessable, so public read is safe.
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
