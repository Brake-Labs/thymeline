-- 019: Tighten NOT NULL constraints
-- The typed Supabase client revealed many columns that are nullable in the DB
-- but non-nullable in the application code. This migration fixes the schema
-- to match the application's assumptions, preventing silent null bugs.

-- ── recipes ──────────────────────────────────────────────────────────────────

-- Backfill any NULLs before adding constraints
UPDATE recipes SET user_id = (SELECT id FROM auth.users LIMIT 1) WHERE user_id IS NULL;
UPDATE recipes SET category = 'main_dish' WHERE category IS NULL;
UPDATE recipes SET is_shared = false WHERE is_shared IS NULL;
UPDATE recipes SET tags = '{}' WHERE tags IS NULL;
UPDATE recipes SET source = 'manual' WHERE source IS NULL;
UPDATE recipes SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE recipes ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN category SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN is_shared SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN is_shared SET DEFAULT false;
ALTER TABLE recipes ALTER COLUMN tags SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN source SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE recipes ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN created_at SET DEFAULT now();

-- ── meal_plan_entries ────────────────────────────────────────────────────────

UPDATE meal_plan_entries SET confirmed = false WHERE confirmed IS NULL;
UPDATE meal_plan_entries SET meal_type = 'dinner' WHERE meal_type IS NULL;

-- recipe_id and meal_plan_id: delete orphaned rows where these are null
DELETE FROM meal_plan_entries WHERE recipe_id IS NULL;
DELETE FROM meal_plan_entries WHERE meal_plan_id IS NULL;

ALTER TABLE meal_plan_entries ALTER COLUMN recipe_id SET NOT NULL;
ALTER TABLE meal_plan_entries ALTER COLUMN meal_plan_id SET NOT NULL;
ALTER TABLE meal_plan_entries ALTER COLUMN confirmed SET NOT NULL;
ALTER TABLE meal_plan_entries ALTER COLUMN confirmed SET DEFAULT false;
ALTER TABLE meal_plan_entries ALTER COLUMN meal_type SET NOT NULL;
ALTER TABLE meal_plan_entries ALTER COLUMN meal_type SET DEFAULT 'dinner';

-- ── meal_plans ───────────────────────────────────────────────────────────────

DELETE FROM meal_plans WHERE user_id IS NULL;
UPDATE meal_plans SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE meal_plans ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE meal_plans ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE meal_plans ALTER COLUMN created_at SET DEFAULT now();

-- ── recipe_history ───────────────────────────────────────────────────────────

DELETE FROM recipe_history WHERE recipe_id IS NULL;
DELETE FROM recipe_history WHERE user_id IS NULL;
UPDATE recipe_history SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE recipe_history ALTER COLUMN recipe_id SET NOT NULL;
ALTER TABLE recipe_history ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE recipe_history ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE recipe_history ALTER COLUMN created_at SET DEFAULT now();

-- ── user_preferences ─────────────────────────────────────────────────────────

DELETE FROM user_preferences WHERE user_id IS NULL;
UPDATE user_preferences SET options_per_day = 3 WHERE options_per_day IS NULL;
UPDATE user_preferences SET cooldown_days = 28 WHERE cooldown_days IS NULL;
UPDATE user_preferences SET seasonal_mode = true WHERE seasonal_mode IS NULL;
UPDATE user_preferences SET preferred_tags = '{}' WHERE preferred_tags IS NULL;
UPDATE user_preferences SET avoided_tags = '{}' WHERE avoided_tags IS NULL;
UPDATE user_preferences SET created_at = now() WHERE created_at IS NULL;

ALTER TABLE user_preferences ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE user_preferences ALTER COLUMN options_per_day SET NOT NULL;
ALTER TABLE user_preferences ALTER COLUMN options_per_day SET DEFAULT 3;
ALTER TABLE user_preferences ALTER COLUMN cooldown_days SET NOT NULL;
ALTER TABLE user_preferences ALTER COLUMN cooldown_days SET DEFAULT 28;
ALTER TABLE user_preferences ALTER COLUMN seasonal_mode SET NOT NULL;
ALTER TABLE user_preferences ALTER COLUMN seasonal_mode SET DEFAULT true;
ALTER TABLE user_preferences ALTER COLUMN preferred_tags SET NOT NULL;
ALTER TABLE user_preferences ALTER COLUMN preferred_tags SET DEFAULT '{}';
ALTER TABLE user_preferences ALTER COLUMN avoided_tags SET NOT NULL;
ALTER TABLE user_preferences ALTER COLUMN avoided_tags SET DEFAULT '{}';
ALTER TABLE user_preferences ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE user_preferences ALTER COLUMN created_at SET DEFAULT now();

-- ── pantry_items ─────────────────────────────────────────────────────────────

UPDATE pantry_items SET added_at = now() WHERE added_at IS NULL;
UPDATE pantry_items SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE pantry_items ALTER COLUMN added_at SET NOT NULL;
ALTER TABLE pantry_items ALTER COLUMN added_at SET DEFAULT now();
ALTER TABLE pantry_items ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE pantry_items ALTER COLUMN updated_at SET DEFAULT now();

-- ── grocery_lists ────────────────────────────────────────────────────────────

UPDATE grocery_lists SET created_at = now() WHERE created_at IS NULL;
UPDATE grocery_lists SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE grocery_lists ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE grocery_lists ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE grocery_lists ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE grocery_lists ALTER COLUMN updated_at SET DEFAULT now();
