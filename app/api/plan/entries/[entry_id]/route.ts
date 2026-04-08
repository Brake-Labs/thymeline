import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { mealPlanEntries, mealPlans } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'

export const DELETE = withAuth(async (req, { user, ctx }, params) => {
  const entryId = params.entryId!

  try {
    // Look up the entry and verify ownership via join on meal_plans
    const rows = await db
      .select({
        id: mealPlanEntries.id,
        mealPlanId: mealPlanEntries.mealPlanId,
        planUserId: mealPlans.userId,
        planHouseholdId: mealPlans.householdId,
      })
      .from(mealPlanEntries)
      .innerJoin(mealPlans, eq(mealPlanEntries.mealPlanId, mealPlans.id))
      .where(eq(mealPlanEntries.id, entryId))

    const entry = dbFirst(rows)

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    const authorized = ctx
      ? entry.planHouseholdId === ctx.householdId
      : entry.planUserId === user.id
    if (!authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.delete(mealPlanEntries).where(eq(mealPlanEntries.id, entryId))

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
})
