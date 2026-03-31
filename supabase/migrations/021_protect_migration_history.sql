-- Enable RLS on _migration_history to prevent access via PostgREST/Supabase client.
-- This table is only used by the migration runner (psql with SUPABASE_DB_URL),
-- which connects as the postgres role and bypasses RLS.

ALTER TABLE public._migration_history ENABLE ROW LEVEL SECURITY;

-- No policies = no access via the API. The postgres role (used by psql) bypasses RLS.
