import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { and, gte, lte, inArray } from 'drizzle-orm'
import { mealPlans, mealPlanEntries } from '@/lib/db/schema'
import { scopeCondition } from '@/lib/household'

export const GET = withAuth(async (req: NextRequest, { user, ctx }) => {
  const url = new URL(req.url)
  const date_from = url.searchParams.get('date_from')
  const date_to   = url.searchParams.get('date_to')

  if (!date_from || !date_to) {
    return NextResponse.json({ error: 'date_from and date_to are required' }, { status: 400 })
  }

  // Fetch all plan IDs scoped to this user/household
  const planRows = await db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(scopeCondition(
      { userId: mealPlans.userId, householdId: mealPlans.householdId },
      user.id,
      ctx,
    ))

  if (planRows.length === 0) {
    return NextResponse.json({ recipe_count: 0 })
  }

  const planIds = planRows.map((p) => p.id)

  const entryRows = await db
    .select({ recipeId: mealPlanEntries.recipeId })
    .from(mealPlanEntries)
    .where(and(
      inArray(mealPlanEntries.mealPlanId, planIds),
      gte(mealPlanEntries.plannedDate, date_from),
      lte(mealPlanEntries.plannedDate, date_to),
    ))

  const recipe_count = new Set(entryRows.map((e) => e.recipeId)).size

  return NextResponse.json({ recipe_count })
})
