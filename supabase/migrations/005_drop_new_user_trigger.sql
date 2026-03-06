-- Brief 04 hotfix: preference seeding moved from DB trigger to API
-- The handle_new_user trigger was unreliable due to supabase_auth_admin
-- permission issues. user_preferences rows are now seeded by
-- POST /api/invite/consume after a valid invite is consumed.
drop trigger if exists on_auth_user_created on auth.users;
