import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { and, gte, lte, inArray } from 'drizzle-orm'
import { mealPlans, mealPlanEntries } from '@/lib/db/schema'
import { scopeCondition } from '@/lib/household'

export const GET = withAuth(async (req: NextRequest, { user, ctx }) => {
  const url = new URL(req.url)
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo   = url.searchParams.get('dateTo')

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'dateFrom and dateTo are required' }, { status: 400 })
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
      gte(mealPlanEntries.plannedDate, dateFrom),
      lte(mealPlanEntries.plannedDate, dateTo),
    ))

  const recipe_count = new Set(entryRows.map((e) => e.recipeId)).size

  return NextResponse.json({ recipe_count })
})
