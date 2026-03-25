-- Add flexible date range to grocery lists.
-- week_start is kept for backward compat and set to date_from on new lists.
-- meal_plan_id is made nullable to support multi-plan (multi-week) lists.

alter table grocery_lists
  add column if not exists date_from date,
  add column if not exists date_to   date;

-- Backfill: existing single-week lists use week_start as the range
update grocery_lists
  set date_from = week_start,
      date_to   = week_start + interval '6 days'
  where date_from is null;

-- Allow null meal_plan_id for lists that span multiple meal plans
alter table grocery_lists
  alter column meal_plan_id drop not null;
