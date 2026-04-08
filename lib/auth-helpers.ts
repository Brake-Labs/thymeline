/**
 * Server-side auth helper for server components and layouts.
 * Supports DEV_BYPASS_AUTH for testing without Google OAuth.
 */
import { headers } from 'next/headers'
import { auth } from './auth-server'

export interface SessionUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

/**
 * Get the current user from the session. Returns null if not authenticated.
 * When DEV_BYPASS_AUTH=true, returns a dev user without checking the session.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (process.env.DEV_BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    return {
      id: process.env.DEV_BYPASS_AUTH_USER_ID ?? 'dev-user',
      email: process.env.DEV_BYPASS_AUTH_EMAIL ?? 'dev@localhost',
      name: 'Dev User',
      image: null,
    }
  }

  try {
    const headersList = await headers()
    const session = await auth.api.getSession({ headers: headersList })
    if (!session?.user) return null

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    }
  } catch {
    // auth.api.getSession can throw when the session cookie is malformed
    // (e.g. immediately after sign-out). Treat any exception as "no session"
    // so the caller redirects to /login rather than propagating a 404/500.
    return null
  }
}
