import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, invalidateAllowedUsersCache } from '@/lib/auth'
import { db } from '@/lib/db'
import { allowedUsers } from '@/lib/db/schema'
import { parseBody, inviteUserSchema } from '@/lib/schemas'
import { logger } from '@/lib/logger'

export const POST = withAdmin(async (req: NextRequest, { user }) => {
  const { data: body, error } = await parseBody(req, inviteUserSchema)
  if (error) return error

  try {
    const result = await db
      .insert(allowedUsers)
      .values({ email: body.email, addedBy: user.id })
      .onConflictDoNothing()
      .returning({ id: allowedUsers.id, email: allowedUsers.email })

    if (result.length === 0) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
    }

    invalidateAllowedUsersCache()
    return NextResponse.json({ user: result[0] }, { status: 201 })
  } catch (err) {
    logger.error({ err, email: body.email }, 'Failed to invite user')
    return NextResponse.json({ error: 'Failed to invite user' }, { status: 500 })
  }
})
