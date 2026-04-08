import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { parseIngredientLine } from '@/lib/grocery'
import { logRecipeSchema, deleteLogSchema, parseBody } from '@/lib/schemas'
import { getTodayISO } from '@/lib/date-utils'
import { checkOwnership } from '@/lib/household'
import { db } from '@/lib/db'
import { eq, and, inArray } from 'drizzle-orm'
import { recipes, recipeHistory, pantryItems } from '@/lib/db/schema'

export const POST = withAuth(async (req: NextRequest, { user, ctx }, params) => {
  const id = params.id!

  const ownership = await checkOwnership('recipes', id, user.id, ctx)
  if (!ownership.owned) {
    const msg = ownership.status === 404 ? 'Not found' : 'Forbidden'
    return NextResponse.json({ error: msg }, { status: ownership.status })
  }

  // Accept optional madeOn from body; default to today
  const today = getTodayISO()
  const { data: body } = await parseBody(req, logRecipeSchema)
  const madeOn = body?.madeOn ?? today

  const baseInsert = { recipeId: id, userId: user.id, madeOn }
  const insertRow = body?.makeAgain !== undefined
    ? { ...baseInsert, makeAgain: body.makeAgain }
    : baseInsert

  try {
    const [inserted] = await db
      .insert(recipeHistory)
      .values(insertRow)
      .returning({ id: recipeHistory.id })

    // Silent pantry deduction — fire and forget, never affects the HTTP response
    if (id) void deductPantryIngredients(id, user.id).catch(() => {})

    return NextResponse.json({ madeOn: madeOn, alreadyLogged: false, entryId: inserted?.id ?? null })
  } catch (err) {
    // Unique constraint violation = already logged today — treat as idempotent
    const errMsg = err instanceof Error ? err.message : String(err)
    const alreadyLogged =
      errMsg.includes('23505') || errMsg.includes('recipe_history_unique_day') || errMsg.includes('duplicate key')

    if (!alreadyLogged) {
      console.error('DB error:', err)
      return NextResponse.json({ error: 'Failed to log recipe' }, { status: 500 })
    }

    // Find the existing entry
    const existingRows = await db
      .select({ id: recipeHistory.id })
      .from(recipeHistory)
      .where(
        and(
          eq(recipeHistory.recipeId, id),
          eq(recipeHistory.userId, user.id),
          eq(recipeHistory.madeOn, madeOn),
        ),
      )

    const entryId = existingRows[0]?.id ?? null

    // Silent pantry deduction — fire and forget, never affects the HTTP response
    if (id) void deductPantryIngredients(id, user.id).catch(() => {})

    return NextResponse.json({ madeOn: madeOn, alreadyLogged: true, entryId: entryId })
  }
})

// Pattern for clearly singular quantities (null quantity is also deductible)
const SINGULAR_QTY_PATTERN = /^\d+\s*(can|cans|lb|lbs|oz|piece|pieces|item|items|pack|packs)$/i

async function deductPantryIngredients(recipeId: string, userId: string): Promise<void> {
  // Fetch recipe ingredients text
  const recipeRows = await db
    .select({ ingredients: recipes.ingredients })
    .from(recipes)
    .where(eq(recipes.id, recipeId))

  const recipe = recipeRows[0]
  if (!recipe?.ingredients) return

  // Parse ingredient names from each line
  const ingredientNames = recipe.ingredients
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseIngredientLine(line).rawName.toLowerCase().trim())
    .filter(Boolean)

  // Fetch all pantry items for this user
  const pantryRows = await db
    .select({ id: pantryItems.id, name: pantryItems.name, quantity: pantryItems.quantity, userId: pantryItems.userId })
    .from(pantryItems)
    .where(eq(pantryItems.userId, userId))

  if (!pantryRows.length) return

  const idsToDelete: string[] = []
  for (const pantryItem of pantryRows) {
    const pantryName = pantryItem.name.toLowerCase().trim()
    const matched = ingredientNames.some(
      (ing) => pantryName.includes(ing) || ing.includes(pantryName),
    )
    if (!matched) continue

    if (pantryItem.quantity === null || SINGULAR_QTY_PATTERN.test(pantryItem.quantity)) {
      idsToDelete.push(pantryItem.id)
    }
  }

  if (idsToDelete.length > 0) {
    await db.delete(pantryItems).where(inArray(pantryItems.id, idsToDelete))
  }
}

export const DELETE = withAuth(async (req: NextRequest, { user }, params) => {
  const id = params.id!

  const { data: body, error: parseError } = await parseBody(req, deleteLogSchema)
  if (parseError) return parseError

  try {
    await db
      .delete(recipeHistory)
      .where(
        and(
          eq(recipeHistory.recipeId, id),
          eq(recipeHistory.userId, user.id),
          eq(recipeHistory.madeOn, body.madeOn),
        ),
      )

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to delete log entry' }, { status: 500 })
  }
})
