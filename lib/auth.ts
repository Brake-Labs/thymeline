import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from './supabase-server'
import { resolveHouseholdScope } from './household'
import { logger } from './logger'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { HouseholdContext } from '@/types'

export interface AuthContext {
  user: User
  db: SupabaseClient<Database>
  ctx: HouseholdContext | null
}

/**
 * Higher-order function that wraps an API route handler with authentication.
 * Verifies the user via Supabase auth, creates an admin DB client,
 * and resolves household scope before calling the handler.
 *
 * Usage:
 *   export const GET = withAuth(async (req, { user, db, ctx }) => {
 *     // route logic — user is guaranteed to be authenticated
 *   })
 *
 *   // With dynamic route params:
 *   export const GET = withAuth(async (req, { user, db, ctx }, params) => {
 *     const { id } = params
 *   })
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
    const supabase = createServerClient(req)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    const route = req.nextUrl?.pathname ?? new URL(req.url).pathname
    if (error || !user) {
      logger.debug({ route, error: error?.message ?? 'no user' }, 'auth failed — 401')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const db = createAdminClient()
    const ctx = await resolveHouseholdScope(db, user.id)
    logger.debug({ userId: user.id, household: ctx?.householdId ?? null, route }, 'auth ok')
    return handler(req, { user, db, ctx }, routeContext?.params ?? {})
  }
}
