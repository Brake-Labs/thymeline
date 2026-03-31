import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import { config } from './config'

/**
 * Creates an authenticated Supabase client for use in API routes.
 * Reads the Bearer token from the Authorization header.
 * Use this ONLY to verify user identity via supabase.auth.getUser().
 *
 * NOTE: Due to how PostgREST validates JWTs, auth.uid() may return null
 * for DB queries made with this client, causing RLS INSERT failures.
 * Use createAdminClient() for actual DB reads/writes after verifying auth.
 */
export function createServerClient(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  return createClient<Database>(
    config.supabase.url,
    config.supabase.anonKey,
    token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {},
  )
}

/**
 * Creates a Supabase client with the service role key.
 * This bypasses Row Level Security — use it only after verifying the user
 * via createServerClient().auth.getUser(), and always scope queries to user.id.
 */
export function createAdminClient() {
  return createClient<Database>(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
