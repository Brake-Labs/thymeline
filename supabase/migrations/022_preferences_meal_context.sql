-- Add free-text household context field to user_preferences
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS meal_context text;
