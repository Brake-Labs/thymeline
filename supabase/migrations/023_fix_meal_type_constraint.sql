-- Repair schema state after duplicate migration prefix conflict.
--
-- The migrations folder contains two files with prefix 010_:
--   010_fix_rls_and_clean_tags.sql
--   010_meal_plan_entries_meal_types.sql
--
-- Supabase tracks migrations by their numeric prefix as the version key.
-- When 010_fix_rls_and_clean_tags is applied first, 010_meal_plan_entries_meal_types
-- is silently skipped (version 010 is already recorded as applied). As a result the
-- meal_type, is_side_dish, and parent_entry_id columns may never have been added to
-- meal_plan_entries in production, and 013_meal_type_add_dessert (which only updates
-- a constraint) also had nothing to act on. This migration is idempotent and brings
-- any affected database up to the correct state.

-- 1. Ensure the three columns added by 010_meal_plan_entries_meal_types exist.
alter table meal_plan_entries
  add column if not exists meal_type text not null default 'dinner';

alter table meal_plan_entries
  add column if not exists is_side_dish bool not null default false;

alter table meal_plan_entries
  add column if not exists parent_entry_id uuid
    references meal_plan_entries(id) on delete cascade;

-- 2. Drop all known variants of the meal_type check constraint name
--    (PostgreSQL auto-names inline CHECK constraints as <table>_<col>_check,
--    <table>_<col>_check1, etc.) then recreate it with the full allowed set
--    including 'dessert'.
alter table meal_plan_entries drop constraint if exists meal_plan_entries_meal_type_check;
alter table meal_plan_entries drop constraint if exists meal_plan_entries_meal_type_check1;

alter table meal_plan_entries
  add constraint meal_plan_entries_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'dessert'));
