ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS hidden_tags text[] DEFAULT '{}';
