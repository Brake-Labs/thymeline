import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { swapEntriesSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { eq, sql } from 'drizzle-orm'
import { mealPlanEntries, mealPlans } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'

export const POST = withAuth(async (req, { user, ctx }) => {
  const { data: body, error } = await parseBody(req, swapEntriesSchema)
  if (error) return error

  const { entry_id_a, entry_id_b } = body

  if (entry_id_a === entry_id_b) {
    return NextResponse.json({ error: 'entry_id_a and entry_id_b must be different' }, { status: 400 })
  }

  // Fetch both entries in parallel with their parent plan's ownership info
  const [rowsA, rowsB] = await Promise.all([
    db.select({
      id: mealPlanEntries.id,
      plannedDate: mealPlanEntries.plannedDate,
      recipeId: mealPlanEntries.recipeId,
      mealPlanId: mealPlanEntries.mealPlanId,
      planUserId: mealPlans.userId,
      planHouseholdId: mealPlans.householdId,
    })
      .from(mealPlanEntries)
      .innerJoin(mealPlans, eq(mealPlanEntries.mealPlanId, mealPlans.id))
      .where(eq(mealPlanEntries.id, entry_id_a))
      .limit(1),
    db.select({
      id: mealPlanEntries.id,
      plannedDate: mealPlanEntries.plannedDate,
      recipeId: mealPlanEntries.recipeId,
      mealPlanId: mealPlanEntries.mealPlanId,
      planUserId: mealPlans.userId,
      planHouseholdId: mealPlans.householdId,
    })
      .from(mealPlanEntries)
      .innerJoin(mealPlans, eq(mealPlanEntries.mealPlanId, mealPlans.id))
      .where(eq(mealPlanEntries.id, entry_id_b))
      .limit(1),
  ])

  const entryA = dbFirst(rowsA)
  const entryB = dbFirst(rowsB)

  if (!entryA || !entryB) {
    return NextResponse.json({ error: 'One or both entries not found' }, { status: 404 })
  }

  // Ownership check
  if (ctx) {
    if (entryA.planHouseholdId !== ctx.householdId || entryB.planHouseholdId !== ctx.householdId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    if (entryA.planUserId !== user.id || entryB.planUserId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Atomic swap via RPC
  try {
    await db.execute(sql`SELECT swap_meal_plan_entries(${entry_id_a}::uuid, ${entry_id_b}::uuid)`)
  } catch {
    // RPC unavailable (e.g. migration 028 not yet applied) — fall back to two concurrent UPDATEs.
    // Not atomic, but acceptable for a meal-planning context.
    try {
      await Promise.all([
        db.update(mealPlanEntries).set({ plannedDate: entryB.plannedDate }).where(eq(mealPlanEntries.id, entry_id_a)),
        db.update(mealPlanEntries).set({ plannedDate: entryA.plannedDate }).where(eq(mealPlanEntries.id, entry_id_b)),
      ])
    } catch {
      return NextResponse.json({ error: 'Swap failed' }, { status: 500 })
    }
  }

  // Re-fetch both rows to get updated planned_date values
  const [updatedRowsA, updatedRowsB] = await Promise.all([
    db.select({
      id: mealPlanEntries.id,
      plannedDate: mealPlanEntries.plannedDate,
      recipeId: mealPlanEntries.recipeId,
    })
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entry_id_a))
      .limit(1),
    db.select({
      id: mealPlanEntries.id,
      plannedDate: mealPlanEntries.plannedDate,
      recipeId: mealPlanEntries.recipeId,
    })
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entry_id_b))
      .limit(1),
  ])

  const resultA = dbFirst(updatedRowsA)
  const resultB = dbFirst(updatedRowsB)

  return NextResponse.json({
    entry_a: resultA ? { id: resultA.id, planned_date: resultA.plannedDate, recipe_id: resultA.recipeId } : null,
    entry_b: resultB ? { id: resultB.id, planned_date: resultB.plannedDate, recipe_id: resultB.recipeId } : null,
  })
})
