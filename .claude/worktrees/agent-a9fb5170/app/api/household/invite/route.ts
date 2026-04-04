import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { canManage } from '@/lib/household'

// ── POST /api/household/invite — generate invite link ─────────────────────────

export const POST = withAuth(async (req, { user, db, ctx }) => {
  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (!canManage(ctx.role)) {
    return NextResponse.json({ error: 'Only owner or co-owner can create invites' }, { status: 403 })
  }

  const { data: invite, error: inviteError } = await db
    .from('household_invites')
    .insert({ household_id: ctx.householdId, invited_by: user.id })
    .select('token, expires_at')
    .single()

  if (inviteError || !invite) {
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const invite_url = `${siteUrl}/household/join?token=${invite.token}`

  return NextResponse.json({ invite_url, expires_at: invite.expires_at }, { status: 201 })
})
