import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { canManage } from '@/lib/household'
import { db } from '@/lib/db'
import { householdInvites } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'

// ── POST /api/household/invite — generate invite link ─────────────────────────

export const POST = withAuth(async (req, { user, ctx }) => {
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (!canManage(ctx.role)) {
    return NextResponse.json({ error: 'Only owner or co-owner can create invites' }, { status: 403 })
  }

  try {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const token = crypto.randomUUID()

    const rows = await db
      .insert(householdInvites)
      .values({
        householdId: ctx.householdId,
        invitedBy: user.id,
        token,
        expiresAt,
      })
      .returning({
        token: householdInvites.token,
        expires_at: householdInvites.expiresAt,
      })

    const invite = dbFirst(rows)
    if (!invite) {
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const invite_url = `${siteUrl}/household/join?token=${invite.token}`

    return NextResponse.json({ invite_url, expires_at: invite.expires_at }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/household/invite] error:', err)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
})
