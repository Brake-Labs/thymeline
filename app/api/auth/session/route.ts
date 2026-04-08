/**
 * GET /api/auth/session
 *
 * Returns the current authenticated user, respecting DEV_BYPASS_AUTH.
 * Unlike Better Auth's built-in /api/auth/get-session, this endpoint goes
 * through withAuth(), so dev bypass mode works correctly without a real
 * Google OAuth session.
 */
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'

export const GET = withAuth(async (_req, { user }) => {
  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } })
})
