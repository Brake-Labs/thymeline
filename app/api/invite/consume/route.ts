import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

async function setInactive(supabase: ReturnType<typeof createServerClient>, userId: string) {
  await supabase
    .from('user_preferences')
    .update({ is_active: false })
    .eq('user_id', userId)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { token: string | null }
  try {
    body = await req.json()
  } catch {
    await setInactive(supabase, user.id)
    return NextResponse.json({ success: false, reason: 'No invite token' })
  }

  const { token } = body

  // No token provided
  if (!token) {
    await setInactive(supabase, user.id)
    return NextResponse.json({ success: false, reason: 'No invite token' })
  }

  // Look up the token
  const { data: invite, error: lookupError } = await supabase
    .from('invites')
    .select('id, used_by, expires_at')
    .eq('token', token)
    .single()

  if (lookupError || !invite) {
    await setInactive(supabase, user.id)
    return NextResponse.json({ success: false, reason: 'Token not found' })
  }

  if (invite.used_by) {
    await setInactive(supabase, user.id)
    return NextResponse.json({ success: false, reason: 'Already used' })
  }

  if (new Date(invite.expires_at) <= new Date()) {
    await setInactive(supabase, user.id)
    return NextResponse.json({ success: false, reason: 'Expired' })
  }

  // Consume the invite
  const { error: consumeError } = await supabase
    .from('invites')
    .update({ used_by: user.id, used_at: new Date().toISOString() })
    .eq('id', invite.id)

  if (consumeError) {
    await setInactive(supabase, user.id)
    return NextResponse.json({ success: false, reason: 'Failed to consume invite' })
  }

  return NextResponse.json({ success: true })
}
