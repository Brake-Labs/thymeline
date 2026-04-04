import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'

// ── GET /api/household/invite/validate?token=<token> ─────────────────────────

export const GET = withAuth(async (req, { db }) => {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) {
    return NextResponse.json({ valid: false })
  }

  const { data: invite } = await db
    .from('household_invites')
    .select('id, household_id, used_by, expires_at')
    .eq('token', token)
    .single()

  if (!invite) {
    return NextResponse.json({ valid: false })
  }

  if (invite.used_by !== null) {
    return NextResponse.json({ valid: false })
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ valid: false })
  }

  const { data: household } = await db
    .from('households')
    .select('name')
    .eq('id', invite.household_id)
    .single()

  return NextResponse.json({
    valid: true,
    household_name: household?.name ?? null,
    expires_at: invite.expires_at,
  })
})
