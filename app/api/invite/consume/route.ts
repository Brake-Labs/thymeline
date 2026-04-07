import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { consumeInviteSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { invites, userPreferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { dbFirst } from '@/lib/db/helpers'

async function setInactive(userId: string) {
  await db
    .update(userPreferences)
    .set({ isActive: false })
    .where(eq(userPreferences.userId, userId))
}

export const POST = withAuth(async (req, { user }) => {
  // Never deactivate a user who already has completed onboarding — they are a
  // returning user who should not be penalised for lacking an invite token.
  const existingPrefsRows = await db
    .select({ onboardingCompleted: userPreferences.onboardingCompleted })
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id))

  const existingPrefs = dbFirst(existingPrefsRows)
  if (existingPrefs?.onboardingCompleted === true) {
    return NextResponse.json({ success: false, reason: 'Already registered' })
  }

  const { data: body, error: parseError } = await parseBody(req, consumeInviteSchema)
  if (parseError) {
    await setInactive(user.id)
    return NextResponse.json({ success: false, reason: 'No invite token' })
  }

  const { token } = body

  // Look up the token
  const inviteRows = await db
    .select({
      id: invites.id,
      usedBy: invites.usedBy,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(eq(invites.token, token))

  const invite = dbFirst(inviteRows)

  if (!invite) {
    await setInactive(user.id)
    return NextResponse.json({ success: false, reason: 'Token not found' })
  }

  if (invite.usedBy) {
    await setInactive(user.id)
    return NextResponse.json({ success: false, reason: 'Already used' })
  }

  if (new Date(invite.expiresAt) <= new Date()) {
    await setInactive(user.id)
    return NextResponse.json({ success: false, reason: 'Expired' })
  }

  // Consume the invite
  try {
    await db
      .update(invites)
      .set({ usedBy: user.id, usedAt: new Date() })
      .where(eq(invites.id, invite.id))
  } catch (err) {
    console.error('[POST /api/invite/consume] consume error:', err)
    await setInactive(user.id)
    return NextResponse.json({ success: false, reason: 'Failed to consume invite' })
  }

  // Seed preferences for the new user if not already present
  await db
    .insert(userPreferences)
    .values({
      userId: user.id,
      optionsPerDay: 3,
      cooldownDays: 28,
      seasonalMode: true,
      preferredTags: [],
      avoidedTags: [],
      limitedTags: [],
      onboardingCompleted: false,
      isActive: true,
    })
    .onConflictDoNothing({ target: userPreferences.userId })

  return NextResponse.json({ success: true })
})
