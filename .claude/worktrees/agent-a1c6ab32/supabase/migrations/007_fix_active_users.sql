-- Fix all existing provisioned users whose is_active was corrupted to false
-- by the pre-hotfix-11 plain-upsert bug in invite/consume.
--
-- Any user with a user_preferences row was provisioned at some point
-- (either by the old DB trigger or by a successful invite/consume).
-- The setInactive() function is UPDATE-only and no-ops when no row exists,
-- so users without a row are correctly excluded.
UPDATE user_preferences SET is_active = true;
