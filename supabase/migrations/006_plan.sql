-- Brief 05: Help Me Plan

-- 2a. Add people_count to meal_plans (reserved for Brief 06 grocery scaling)
alter table meal_plans
  add column if not exists people_count int default 2;

-- 2b. Enable RLS on meal_plans and meal_plan_entries
alter table meal_plans enable row level security;
alter table meal_plan_entries enable row level security;

create policy "owner access meal_plans"
  on meal_plans for all
  using (auth.uid() = user_id);

-- meal_plan_entries are scoped via their parent meal_plan
create policy "owner access meal_plan_entries"
  on meal_plan_entries for all
  using (
    meal_plan_id in (
      select id from meal_plans where user_id = auth.uid()
    )
  );
