import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

let client: ReturnType<typeof createBrowserClient<Database>> | null = null

/**
 * Returns a singleton Supabase browser client for use in client components.
 * Uses @supabase/ssr which handles cookie-based session management.
 */
export function getSupabaseClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return client
}

/**
 * Returns the current session's access token. Async because the session
 * is fetched from the Supabase server on first call.
 */
export async function getAccessToken(): Promise<string> {
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  return session?.access_token ?? ''
}
