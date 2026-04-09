import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { config } from '@/lib/config'
import { db } from '@/lib/db'
import { invites } from '@/lib/db/schema'
import { logger } from '@/lib/logger'

export const POST = withAdmin(async (_req, { user }) => {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  try {
    await db
      .insert(invites)
      .values({ token, createdBy: user.id, expiresAt })

    return NextResponse.json({
      inviteUrl: `${config.siteUrl}/invite?token=${token}`,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (err) {
    logger.error({ err, route: '/api/admin/invite' }, 'failed to create invite')
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
})
