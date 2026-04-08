import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { config } from '@/lib/config'
import { db } from '@/lib/db'
import { invites } from '@/lib/db/schema'

export const POST = withAuth(async (req, { user }) => {
  const admins = config.adminEmails
  if (admins.length === 0 || !admins.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  try {
    await db
      .insert(invites)
      .values({ token, createdBy: user.id, expiresAt })

    return NextResponse.json({
      invite_url: `${config.siteUrl}/invite?token=${token}`,
      expires_at: expiresAt.toISOString(),
    })
  } catch (err) {
    console.error('[POST /api/admin/invite] error:', err)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
})
