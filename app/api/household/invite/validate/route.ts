import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { householdInvites, households } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { dbFirst } from '@/lib/db/helpers'

// ── GET /api/household/invite/validate?token=<token> ─────────────────────────

export const GET = withAuth(async (req) => {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) {
    return NextResponse.json({ valid: false })
  }

  try {
    const inviteRows = await db
      .select({
        id: householdInvites.id,
        householdId: householdInvites.householdId,
        used_by: householdInvites.usedBy,
        expires_at: householdInvites.expiresAt,
      })
      .from(householdInvites)
      .where(eq(householdInvites.token, token))

    const invite = dbFirst(inviteRows)

    if (!invite) {
      return NextResponse.json({ valid: false })
    }

    if (invite.used_by !== null) {
      return NextResponse.json({ valid: false })
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ valid: false })
    }

    const householdRows = await db
      .select({ name: households.name })
      .from(households)
      .where(eq(households.id, invite.householdId))

    const household = dbFirst(householdRows)

    return NextResponse.json({
      valid: true,
      household_name: household?.name ?? null,
      expires_at: invite.expires_at,
    })
  } catch (err) {
    console.error('[GET /api/household/invite/validate] error:', err)
    return NextResponse.json({ valid: false })
  }
})
