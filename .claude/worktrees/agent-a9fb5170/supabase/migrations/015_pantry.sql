create table pantry_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  quantity     text,           -- freeform: "2 cans", "1 lb", "half a bag"
  section      text,           -- same sections as GrocerySection
  expiry_date  date,
  added_at     timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table pantry_items enable row level security;

create policy "owner full access"
  on pantry_items for all
  using (auth.uid() = user_id);

create index pantry_items_user_id_idx on pantry_items (user_id);
