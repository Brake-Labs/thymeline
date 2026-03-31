-- One-time script: seed _migration_history with all migrations already applied.
-- Run this once before enabling automated migrations.
--
-- Usage: psql "$SUPABASE_DB_URL" -f scripts/seed-migration-history.sql

CREATE TABLE IF NOT EXISTS public._migration_history (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public._migration_history (filename) VALUES
  ('001_initial_schema.sql'),
  ('002_recipe_vault.sql'),
  ('003_preference_settings.sql'),
  ('004_auth.sql'),
  ('005_drop_new_user_trigger.sql'),
  ('006_plan.sql'),
  ('007_fix_active_users.sql'),
  ('008_custom_tags.sql'),
  ('009_custom_tags_section.sql'),
  ('009_grocery_lists.sql'),
  ('010_fix_rls_and_clean_tags.sql'),
  ('010_meal_plan_entries_meal_types.sql'),
  ('011_recipe_time_fields.sql'),
  ('012_recipe_servings.sql'),
  ('013_meal_type_add_dessert.sql'),
  ('014_grocery_list_date_range.sql'),
  ('015_pantry.sql'),
  ('016_recipe_source.sql'),
  ('017_household.sql'),
  ('018_cook_mode.sql'),
  ('019_preferences_constraints.sql'),
  ('020_tighten_nullability.sql')
ON CONFLICT (filename) DO NOTHING;
