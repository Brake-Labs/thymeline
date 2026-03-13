-- Drop user_tags (introduced in migration 001).
-- custom_tags replaces it entirely.
drop table if exists user_tags;

create table custom_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

alter table custom_tags enable row level security;

create policy "Users manage own custom tags"
  on custom_tags for all
  using     (auth.uid() = user_id)
  with check (auth.uid() = user_id);
