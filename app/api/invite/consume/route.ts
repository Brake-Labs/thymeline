import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { consumeInviteSchema, parseBody } from '@/lib/schemas'

async function setInactive(db: Parameters<Parameters<typeof withAuth>[0]>[1]['db'], userId: string) {
  await db
    .from('user_preferences')
    .update({ is_active: false })
    .eq('user_id', userId)
}

export const POST = withAuth(async (req, { user, db }) => {
  // Never deactivate a user who already has completed onboarding — they are a
  // returning user who should not be penalised for lacking an invite token.
  const { data: existingPrefs } = await db
    .from('user_preferences')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .single()
  if (existingPrefs?.onboarding_completed === true) {
    return NextResponse.json({ success: false, reason: 'Already registered' })
  }

  const { data: body, error: parseError } = await parseBody(req, consumeInviteSchema)
  if (parseError) {
    await setInactive(db, user.id)
    return NextResponse.json({ success: false, reason: 'No invite token' })
  }

  const { token } = body

  // Look up the token
  const { data: invite, error: lookupError } = await db
    .from('invites')
    .select('id, used_by, expires_at')
    .eq('token', token)
    .single()

  if (lookupError || !invite) {
    await setInactive(db, user.id)
    return NextResponse.json({ success: false, reason: 'Token not found' })
  }

  if (invite.used_by) {
    await setInactive(db, user.id)
    return NextResponse.json({ success: false, reason: 'Already used' })
  }

  if (new Date(invite.expires_at) <= new Date()) {
    await setInactive(db, user.id)
    return NextResponse.json({ success: false, reason: 'Expired' })
  }

  // Consume the invite
  const { error: consumeError } = await db
    .from('invites')
    .update({ used_by: user.id, used_at: new Date().toISOString() })
    .eq('id', invite.id)

  if (consumeError) {
    await setInactive(db, user.id)
    return NextResponse.json({ success: false, reason: 'Failed to consume invite' })
  }

  // Seed preferences for the new user if not already present
  await db.from('user_preferences').upsert({
    user_id: user.id,
    options_per_day: 3,
    cooldown_days: 28,
    seasonal_mode: true,
    preferred_tags: [],
    avoided_tags: [],
    limited_tags: [],
    onboarding_completed: false,
    is_active: true,
  }, { onConflict: 'user_id', ignoreDuplicates: true })

  return NextResponse.json({ success: true })
})
