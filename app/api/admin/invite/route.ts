import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { config } from '@/lib/config'

export const POST = withAuth(async (req, { user, db }) => {
  const adminId = config.admin.userId
  if (!adminId || user.id !== adminId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await db
    .from('invites')
    .insert({ token, created_by: user.id, expires_at: expiresAt })

  if (error) {
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }

  return NextResponse.json({
    invite_url: `${config.siteUrl}/invite?token=${token}`,
    expires_at: expiresAt,
  })
})
