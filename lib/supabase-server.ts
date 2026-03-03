import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

/**
 * Creates an authenticated Supabase client for use in API routes.
 * Reads the Bearer token from the Authorization header.
 */
export function createServerClient(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {},
  )
}
