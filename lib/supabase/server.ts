import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates an authenticated Supabase client for server components, layouts,
 * and server actions. Reads session from cookies (set by middleware).
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: Parameters<typeof cookieStore.set>[2]) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Server components cannot set cookies — safe to ignore
          }
        },
        remove(name: string, options: Parameters<typeof cookieStore.set>[2]) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Server components cannot set cookies — safe to ignore
          }
        },
      },
    },
  )
}
