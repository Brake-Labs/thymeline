import { NextRequest, NextResponse } from 'next/server'
import { auth } from './auth-server'
import { db } from './db'
import { config } from './config'
import { resolveHouseholdScope } from './household'
import { logger } from './logger'
import { withRequestContext } from './request-context'
import { sql } from 'drizzle-orm'
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

// ── Allowed users cache ──────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000
let _allowedUsersCache: Map<string, boolean> | null = null
let _allowedUsersCacheTime = 0

/** Clear the in-memory allowed users cache (e.g. after invite or disable). */
export function invalidateAllowedUsersCache() {
  _allowedUsersCache = null
  _allowedUsersCacheTime = 0
}

async function loadAllowedUsersFromDb(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>()
  try {
    const rows = (await db.execute(
      sql`SELECT email, disabled_at FROM allowed_users`,
    ) as unknown) as { email: string; disabled_at: string | null }[]
    for (const row of rows) {
      map.set(row.email.toLowerCase(), row.disabled_at === null)
    }
  } catch {
    // Table may not exist yet (pre-migration) or in test environments
    logger.debug('allowed_users table not available, skipping DB check')
  }
  return map
}

/**
 * Check if an email is allowed access. Uses a union of:
 * 1. ALLOWED_EMAILS env var (always granted, even if disabled in DB)
 * 2. allowed_users DB table (active = disabledAt IS NULL)
 * 3. If both sources are empty, access is open (no whitelist enforced)
 */
async function isEmailAllowed(email: string): Promise<boolean> {
  const envAllowed = config.allowedEmails
  const normalizedEmail = email.toLowerCase()

  // Env var always wins
  if (envAllowed.includes(normalizedEmail)) return true

  // Check DB with caching
  const now = Date.now()
  if (!_allowedUsersCache || now - _allowedUsersCacheTime > CACHE_TTL_MS) {
    _allowedUsersCache = await loadAllowedUsersFromDb()
    _allowedUsersCacheTime = now
  }

  // Active in DB
  if (_allowedUsersCache.get(normalizedEmail) === true) return true

  // Open access: no env entries and no DB entries
  if (envAllowed.length === 0 && _allowedUsersCache.size === 0) return true

  return false
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
    const route = req.nextUrl?.pathname ?? new URL(req.url).pathname
    let user: AuthUser

    if (process.env.DEV_BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
      user = DEV_USER
    } else {
      const session = await auth.api.getSession({ headers: req.headers })
      if (!session?.user) {
        logger.debug({ route }, 'auth failed — 401')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      }

      // Enforce email whitelist (env var + DB union)
      const allowed = await isEmailAllowed(user.email)
      if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const feature = route.replace(/^\/api\//, '')
    const ctx = await resolveHouseholdScope(user.id)
    logger.debug({ userId: user.id, household: ctx?.householdId ?? null, route }, 'auth ok')

    return withRequestContext({ userId: user.id, feature }, () =>
      handler(req, { user, db, ctx }, routeContext?.params ?? {}),
    )
  }
}

/**
 * Higher-order function for admin-only routes.
 * Wraps withAuth() and additionally checks that the user's email
 * is in the ADMIN_EMAILS config list.
 */
export function withAdmin(
  handler: (
    req: NextRequest,
    auth: AuthContext,
    params: Record<string, string>,
  ) => Promise<NextResponse>,
) {
  return withAuth(async (req, authCtx, params) => {
    const admins = config.adminEmails
    if (admins.length === 0) {
      logger.warn('ADMIN_EMAILS is empty — no users will have admin access')
    }
    if (!admins.includes(authCtx.user.email.toLowerCase())) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    return handler(req, authCtx, params)
  })
}
