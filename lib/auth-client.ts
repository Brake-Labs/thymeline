/**
 * Better Auth browser client.
 *
 * Replaces lib/supabase/browser.ts (getSupabaseClient, getAccessToken).
 * With Better Auth, sessions are cookie-based — no manual token management.
 */
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
})
