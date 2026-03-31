import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from './supabase-server'
import { resolveHouseholdScope } from './household'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { HouseholdContext } from '@/types'

export interface AuthContext {
  user: User
  db: SupabaseClient
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
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const db = createAdminClient()
    const ctx = await resolveHouseholdScope(db, user.id)
    return handler(req, { user, db, ctx }, routeContext?.params ?? {})
  }
}
