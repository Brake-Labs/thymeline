import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, invalidateAllowedUsersCache } from '@/lib/auth'
import { db } from '@/lib/db'
import { user, allowedUsers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const POST = withAdmin(async (_req: NextRequest, _auth, params) => {
  const id = params.id
  if (!id) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
  }

  // Look up the user's email — the param is the Better Auth user ID,
  // but allowed_users is keyed by email.
  const [target] = await db.select({ email: user.email }).from(user).where(eq(user.id, id))
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const result = await db
    .update(allowedUsers)
    .set({ disabledAt: null })
    .where(eq(allowedUsers.email, target.email.toLowerCase()))
    .returning({ id: allowedUsers.id, email: allowedUsers.email, disabledAt: allowedUsers.disabledAt })

  if (result.length === 0) {
    return NextResponse.json({ error: 'User not in allowed list' }, { status: 404 })
  }

  invalidateAllowedUsersCache()
  return NextResponse.json({ user: result[0] })
})
