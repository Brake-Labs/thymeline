alter table meal_plan_entries
  drop constraint if exists meal_plan_entries_meal_type_check;
alter table meal_plan_entries
  add constraint meal_plan_entries_meal_type_check
  check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'dessert'));
