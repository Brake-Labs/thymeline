import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { resolveHouseholdScope } from '@/lib/household'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { entry_id: string } },
) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entry_id } = params
  const db = createAdminClient()
  const ctx = await resolveHouseholdScope(db, user.id)

  // Look up the entry and verify ownership via join on meal_plans
  const { data: entry } = await db
    .from('meal_plan_entries')
    .select('id, meal_plan_id, meal_plans(user_id, household_id)')
    .eq('id', entry_id)
    .maybeSingle()

  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  const plan = (entry.meal_plans as unknown) as { user_id: string; household_id: string | null } | null
  const authorized = ctx
    ? plan?.household_id === ctx.householdId
    : plan?.user_id === user.id
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: deleteError } = await db
    .from('meal_plan_entries')
    .delete()
    .eq('id', entry_id)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
