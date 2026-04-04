-- Add servings to recipes
alter table recipes add column if not exists servings int;

-- Rename people_count → servings on grocery_lists
alter table grocery_lists rename column people_count to servings;

-- Rename people_count → servings on meal_plans (legacy sync column)
alter table meal_plans rename column people_count to servings;
