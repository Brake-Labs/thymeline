import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { swapEntriesSchema, parseBody } from '@/lib/schemas'

type EntryRow = {
  id: string
  planned_date: string
  recipe_id: string
  meal_plan_id: string
  meal_plans: { user_id: string; household_id: string | null } | null
}

export const POST = withAuth(async (req, { user, db, ctx }) => {
  const { data: body, error } = await parseBody(req, swapEntriesSchema)
  if (error) return error

  const { entry_id_a, entry_id_b } = body

  if (entry_id_a === entry_id_b) {
    return NextResponse.json({ error: 'entry_id_a and entry_id_b must be different' }, { status: 400 })
  }

  // Fetch both entries in parallel
  const [resA, resB] = await Promise.all([
    db
      .from('meal_plan_entries')
      .select('id, planned_date, recipe_id, meal_plan_id, meal_plans(user_id, household_id)')
      .eq('id', entry_id_a)
      .maybeSingle(),
    db
      .from('meal_plan_entries')
      .select('id, planned_date, recipe_id, meal_plan_id, meal_plans(user_id, household_id)')
      .eq('id', entry_id_b)
      .maybeSingle(),
  ])

  const entryA = resA.data as EntryRow | null
  const entryB = resB.data as EntryRow | null

  if (!entryA || !entryB) {
    return NextResponse.json({ error: 'One or both entries not found' }, { status: 404 })
  }

  // Ownership check
  if (ctx) {
    if (entryA.meal_plans?.household_id !== ctx.householdId || entryB.meal_plans?.household_id !== ctx.householdId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    if (entryA.meal_plans?.user_id !== user.id || entryB.meal_plans?.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Atomic swap via RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcError } = await (db as any).rpc('swap_meal_plan_entries', {
    entry_id_a,
    entry_id_b,
  })

  if (rpcError) {
    return NextResponse.json({ error: 'Swap failed' }, { status: 500 })
  }

  // Re-fetch both rows to get updated planned_date values
  const [updatedA, updatedB] = await Promise.all([
    db
      .from('meal_plan_entries')
      .select('id, planned_date, recipe_id')
      .eq('id', entry_id_a)
      .maybeSingle(),
    db
      .from('meal_plan_entries')
      .select('id, planned_date, recipe_id')
      .eq('id', entry_id_b)
      .maybeSingle(),
  ])

  return NextResponse.json({
    entry_a: updatedA.data,
    entry_b: updatedB.data,
  })
})
