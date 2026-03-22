alter table recipes
  add column if not exists prep_time_minutes int,
  add column if not exists cook_time_minutes int,
  add column if not exists total_time_minutes int,
  add column if not exists inactive_time_minutes int;
