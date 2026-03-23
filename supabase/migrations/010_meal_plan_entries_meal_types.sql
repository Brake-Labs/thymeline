alter table meal_plan_entries
  add column if not exists meal_type text
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack'))
    default 'dinner',
  add column if not exists is_side_dish bool not null default false,
  add column if not exists parent_entry_id uuid
    references meal_plan_entries(id) on delete cascade;
