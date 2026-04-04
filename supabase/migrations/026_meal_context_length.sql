ALTER TABLE user_preferences
  ALTER COLUMN meal_context TYPE text;
  -- text in Postgres is unlimited; this removes any varchar constraint
