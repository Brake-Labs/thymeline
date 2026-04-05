-- Add week_start_day to user_preferences.
-- 0 = Sunday (default, preserves existing behaviour), 1 = Monday.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS week_start_day int NOT NULL DEFAULT 0;
