import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { resolveHouseholdScope } from '@/lib/household'

// ── POST /api/household/join — consume invite and join ────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.token?.trim()) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const db = createAdminClient()

  // Check if already in a household
  const ctx = await resolveHouseholdScope(db, user.id)
  if (ctx) {
    return NextResponse.json({ error: 'Already in a household.' }, { status: 409 })
  }

  // Fetch and validate invite
  const { data: invite } = await db
    .from('household_invites')
    .select('id, household_id, used_by, expires_at')
    .eq('token', body.token.trim())
    .single()

  if (!invite) {
    return NextResponse.json({ error: 'Invalid invite token' }, { status: 400 })
  }
  if (invite.used_by !== null) {
    return NextResponse.json({ error: 'Invite has already been used' }, { status: 400 })
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invite has expired' }, { status: 400 })
  }

  // Fetch target household
  const { data: household } = await db
    .from('households')
    .select('id, name')
    .eq('id', invite.household_id)
    .single()

  if (!household) {
    return NextResponse.json({ error: 'Household not found' }, { status: 400 })
  }

  // Insert member row (unique index enforces one-household-per-user at DB level)
  const { error: memberError } = await db
    .from('household_members')
    .insert({ household_id: household.id, user_id: user.id, role: 'member' })

  if (memberError) {
    if (memberError.code === '23505') {
      return NextResponse.json({ error: 'Already in a household.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to join household' }, { status: 500 })
  }

  // Mark invite as used
  await db
    .from('household_invites')
    .update({ used_by: user.id })
    .eq('id', invite.id)

  // Data migration: copy solo recipes, pantry_items, and custom_tags into the household
  await db.from('recipes').update({ household_id: household.id }).eq('user_id', user.id).is('household_id', null)
  await db.from('pantry_items').update({ household_id: household.id }).eq('user_id', user.id).is('household_id', null)
  await db.from('custom_tags').update({ household_id: household.id }).eq('user_id', user.id).is('household_id', null)

  // Copy user preferences into household if no household preferences exist yet
  const { data: existingHouseholdPrefs } = await db
    .from('user_preferences')
    .select('id')
    .eq('household_id', household.id)
    .maybeSingle()

  if (!existingHouseholdPrefs) {
    const { data: userPrefs } = await db
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (userPrefs) {
      await db
        .from('user_preferences')
        .upsert({ ...userPrefs, household_id: household.id }, { onConflict: 'household_id' })
    }
  }

  return NextResponse.json({ household_id: household.id, household_name: household.name })
}
