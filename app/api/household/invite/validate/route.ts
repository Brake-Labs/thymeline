import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'

// ── GET /api/household/invite/validate?token=<token> ─────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) {
    return NextResponse.json({ valid: false })
  }

  const db = createAdminClient()
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
}
