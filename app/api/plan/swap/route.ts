import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { swapEntriesSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { eq, inArray, sql } from 'drizzle-orm'
import { mealPlanEntries, mealPlans } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'

export const POST = withAuth(async (req, { user, ctx }) => {
  const { data: body, error } = await parseBody(req, swapEntriesSchema)
  if (error) return error

  const { entryIdA, entryIdB } = body

  if (entryIdA === entryIdB) {
    return NextResponse.json({ error: 'entryIdA and entryIdB must be different' }, { status: 400 })
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
      .where(eq(mealPlanEntries.id, entryIdA))
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
      .where(eq(mealPlanEntries.id, entryIdB))
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

  // Fetch side dishes (entries parented to either entry being swapped) so they
  // follow their parent to its new date.
  const sideDishes = await db.select({
    id: mealPlanEntries.id,
    parentEntryId: mealPlanEntries.parentEntryId,
  })
    .from(mealPlanEntries)
    .where(inArray(mealPlanEntries.parentEntryId, [entryIdA, entryIdB]))

  const sideDishIdsA = sideDishes.filter(sd => sd.parentEntryId === entryIdA).map(sd => sd.id)
  const sideDishIdsB = sideDishes.filter(sd => sd.parentEntryId === entryIdB).map(sd => sd.id)

  // Atomic swap via RPC
  try {
    await db.execute(sql`SELECT swap_meal_plan_entries(${entryIdA}::uuid, ${entryIdB}::uuid)`)
    // Side dishes must follow their parent even when using the RPC path
    await Promise.all([
      ...(sideDishIdsA.length > 0 ? [db.update(mealPlanEntries).set({ plannedDate: entryB.plannedDate }).where(inArray(mealPlanEntries.id, sideDishIdsA))] : []),
      ...(sideDishIdsB.length > 0 ? [db.update(mealPlanEntries).set({ plannedDate: entryA.plannedDate }).where(inArray(mealPlanEntries.id, sideDishIdsB))] : []),
    ])
  } catch {
    // RPC unavailable (e.g. migration 028 not yet applied) — fall back to concurrent UPDATEs.
    // Not atomic, but acceptable for a meal-planning context.
    try {
      await Promise.all([
        db.update(mealPlanEntries).set({ plannedDate: entryB.plannedDate }).where(eq(mealPlanEntries.id, entryIdA)),
        db.update(mealPlanEntries).set({ plannedDate: entryA.plannedDate }).where(eq(mealPlanEntries.id, entryIdB)),
        ...(sideDishIdsA.length > 0 ? [db.update(mealPlanEntries).set({ plannedDate: entryB.plannedDate }).where(inArray(mealPlanEntries.id, sideDishIdsA))] : []),
        ...(sideDishIdsB.length > 0 ? [db.update(mealPlanEntries).set({ plannedDate: entryA.plannedDate }).where(inArray(mealPlanEntries.id, sideDishIdsB))] : []),
      ])
    } catch {
      return NextResponse.json({ error: 'Swap failed' }, { status: 500 })
    }
  }

  // Re-fetch both rows to get updated plannedDate values
  const [updatedRowsA, updatedRowsB] = await Promise.all([
    db.select({
      id: mealPlanEntries.id,
      plannedDate: mealPlanEntries.plannedDate,
      recipeId: mealPlanEntries.recipeId,
    })
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryIdA))
      .limit(1),
    db.select({
      id: mealPlanEntries.id,
      plannedDate: mealPlanEntries.plannedDate,
      recipeId: mealPlanEntries.recipeId,
    })
      .from(mealPlanEntries)
      .where(eq(mealPlanEntries.id, entryIdB))
      .limit(1),
  ])

  const resultA = dbFirst(updatedRowsA)
  const resultB = dbFirst(updatedRowsB)

  return NextResponse.json({
    entryA: resultA ? { id: resultA.id, plannedDate: resultA.plannedDate, recipeId: resultA.recipeId } : null,
    entryB: resultB ? { id: resultB.id, plannedDate: resultB.plannedDate, recipeId: resultB.recipeId } : null,
  })
})
