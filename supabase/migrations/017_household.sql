-- ── Spec 14: Household Sharing ───────────────────────────────────────────────

-- 2a. New tables

CREATE TABLE households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE household_members (
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('owner','co_owner','member')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

-- One household per user
CREATE UNIQUE INDEX household_members_user_unique ON household_members(user_id);

-- Invite tokens (single-use, 7-day TTL)
CREATE TABLE household_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  token        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  used_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2b. Add household_id to existing tables

ALTER TABLE recipes
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE meal_plans
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE pantry_items
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE grocery_lists
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE user_preferences
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

ALTER TABLE custom_tags
  ADD COLUMN household_id uuid REFERENCES households(id) ON DELETE SET NULL;

-- 2c. Partial unique indexes

CREATE UNIQUE INDEX grocery_lists_household_week_start_unique
  ON grocery_lists(household_id, week_start)
  WHERE household_id IS NOT NULL;

CREATE UNIQUE INDEX user_preferences_household_unique
  ON user_preferences(household_id)
  WHERE household_id IS NOT NULL;

CREATE UNIQUE INDEX custom_tags_household_name_unique
  ON custom_tags(household_id, name)
  WHERE household_id IS NOT NULL;

-- 2d. Indexes for lookup performance

CREATE INDEX recipes_household_id_idx       ON recipes(household_id)       WHERE household_id IS NOT NULL;
CREATE INDEX meal_plans_household_id_idx    ON meal_plans(household_id)     WHERE household_id IS NOT NULL;
CREATE INDEX pantry_items_household_id_idx  ON pantry_items(household_id)   WHERE household_id IS NOT NULL;
CREATE INDEX grocery_lists_household_id_idx ON grocery_lists(household_id)  WHERE household_id IS NOT NULL;
CREATE INDEX custom_tags_household_id_idx   ON custom_tags(household_id)    WHERE household_id IS NOT NULL;
