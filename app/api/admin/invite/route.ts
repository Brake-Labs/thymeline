import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'

export const POST = withAuth(async (req, { user, db }) => {
  const adminId = process.env.ADMIN_USER_ID
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return NextResponse.json({
    invite_url: `${siteUrl}/invite?token=${token}`,
    expires_at: expiresAt,
  })
})
