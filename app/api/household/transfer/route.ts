import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'

// ── POST /api/household/transfer — transfer ownership ─────────────────────────

export const POST = withAuth(async (req, { user, db, ctx }) => {
  let body: { new_owner_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.new_owner_id) {
    return NextResponse.json({ error: 'new_owner_id is required' }, { status: 400 })
  }

  if (!ctx) {
    return NextResponse.json({ error: 'Not in a household' }, { status: 404 })
  }
  if (ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can transfer ownership' }, { status: 403 })
  }

  // Verify new_owner_id is a member of this household
  const { data: targetMember } = await db
    .from('household_members')
    .select('user_id, role')
    .eq('household_id', ctx.householdId)
    .eq('user_id', body.new_owner_id)
    .single()

  if (!targetMember) {
    return NextResponse.json({ error: 'new_owner_id is not a member of this household' }, { status: 400 })
  }

  // Update new owner role to 'owner'
  await db
    .from('household_members')
    .update({ role: 'owner' })
    .eq('household_id', ctx.householdId)
    .eq('user_id', body.new_owner_id)

  // Demote current owner to 'co_owner'
  await db
    .from('household_members')
    .update({ role: 'co_owner' })
    .eq('household_id', ctx.householdId)
    .eq('user_id', user.id)

  // Update households.owner_id
  await db
    .from('households')
    .update({ owner_id: body.new_owner_id })
    .eq('id', ctx.householdId)

  return NextResponse.json({ new_owner_id: body.new_owner_id, previous_owner_id: user.id })
})
