import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { scopeQuery } from '@/lib/household'

export const GET = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const url = new URL(req.url)
  const date_from = url.searchParams.get('date_from')
  const date_to   = url.searchParams.get('date_to')

  if (!date_from || !date_to) {
    return NextResponse.json({ error: 'date_from and date_to are required' }, { status: 400 })
  }

  // Fetch all plan IDs scoped to this user/household
  let plansQ = db.from('meal_plans').select('id')
  plansQ = scopeQuery(plansQ, user.id, ctx)
  const { data: plans } = await plansQ

  if (!plans?.length) {
    return NextResponse.json({ recipe_count: 0 })
  }

  const planIds = plans.map((p: { id: string }) => p.id)

  const { data: entries } = await db
    .from('meal_plan_entries')
    .select('recipe_id')
    .in('meal_plan_id', planIds)
    .gte('planned_date', date_from)
    .lte('planned_date', date_to)

  const recipe_count = new Set((entries ?? []).map((e: { recipe_id: string }) => e.recipe_id)).size

  return NextResponse.json({ recipe_count })
})
