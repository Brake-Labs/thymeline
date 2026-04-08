import { NextRequest, NextResponse } from 'next/server'
import { auth } from './auth-server'
import { db } from './db'
import { config } from './config'
import { resolveHouseholdScope } from './household'
import type { HouseholdContext } from '@/types'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

export interface AuthContext {
  user: AuthUser
  db: typeof db
  ctx: HouseholdContext | null
}

/**
 * Dev-only auth bypass user. When DEV_BYPASS_AUTH is set,
 * all API routes use this user without requiring a real session.
 */
const DEV_USER: AuthUser = {
  id: process.env.DEV_BYPASS_AUTH_USER_ID ?? 'dev-user',
  email: process.env.DEV_BYPASS_AUTH_EMAIL ?? 'dev@localhost',
  name: 'Dev User',
  image: null,
}

/**
 * Higher-order function that wraps an API route handler with authentication.
 * Verifies the user via Better Auth session cookie, resolves household scope,
 * and provides the Drizzle db client.
 *
 * When DEV_BYPASS_AUTH=true is set, skips authentication entirely and uses
 * a dev user. This allows Playwright and other test tools to exercise
 * authenticated routes without Google OAuth.
 */
export function withAuth(
  handler: (
    req: NextRequest,
    auth: AuthContext,
    params: Record<string, string>,
  ) => Promise<NextResponse>,
) {
  return async (
    req: NextRequest,
    routeContext?: { params: Record<string, string> },
  ): Promise<NextResponse> => {
    let user: AuthUser

    if (process.env.DEV_BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
      user = DEV_USER
    } else {
      const session = await auth.api.getSession({ headers: req.headers })
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      }

      // Enforce email whitelist (empty list = open access)
      const allowed = config.allowedEmails
      if (allowed.length > 0 && !allowed.includes(user.email.toLowerCase())) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const ctx = await resolveHouseholdScope(user.id)
    return handler(req, { user, db, ctx }, routeContext?.params ?? {})
  }
}
