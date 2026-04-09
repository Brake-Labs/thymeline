import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, invalidateAllowedUsersCache } from '@/lib/auth'
import { db } from '@/lib/db'
import { allowedUsers } from '@/lib/db/schema'
import { logger } from '@/lib/logger'

export const POST = withAdmin(async (req: NextRequest, { user }) => {
  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }

  try {
    const result = await db
      .insert(allowedUsers)
      .values({ email, addedBy: user.id })
      .onConflictDoNothing()
      .returning({ id: allowedUsers.id, email: allowedUsers.email })

    if (result.length === 0) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
    }

    invalidateAllowedUsersCache()
    return NextResponse.json({ user: result[0] }, { status: 201 })
  } catch (err) {
    logger.error({ err, email }, 'Failed to invite user')
    return NextResponse.json({ error: 'Failed to invite user' }, { status: 500 })
  }
})
