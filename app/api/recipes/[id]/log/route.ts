import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-server'
import { parseIngredientLine } from '@/lib/grocery'
import { logRecipeSchema, deleteLogSchema, parseBody } from '@/lib/schemas'
import { getTodayISO } from '@/lib/date-utils'
import { checkOwnership } from '@/lib/household'

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }, params) => {
  const id = params.id!

  const ownership = await checkOwnership(db, 'recipes', id, user.id, ctx)
  if (!ownership.owned) {
    const msg = ownership.status === 404 ? 'Not found' : 'Forbidden'
    return NextResponse.json({ error: msg }, { status: ownership.status })
  }

  // Accept optional made_on from body; default to today
  const today = getTodayISO()
  const { data: body } = await parseBody(req, logRecipeSchema)
  const madeOn = body?.made_on ?? today

  const baseInsert = { recipe_id: id, user_id: user.id, made_on: madeOn }
  const insertRow = body?.make_again !== undefined
    ? { ...baseInsert, make_again: body.make_again }
    : baseInsert

  const { data: inserted, error: insertError } = await db
    .from('recipe_history')
    .insert(insertRow)
    .select('id')
    .single()

  // Unique constraint violation = already logged today — treat as idempotent
  const alreadyLogged =
    insertError != null &&
    (insertError.code === '23505' || insertError.message.includes('recipe_history_unique_day'))

  if (insertError && !alreadyLogged) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  let entryId: string | null = inserted?.id ?? null
  if (alreadyLogged) {
    const { data: existing } = await db
      .from('recipe_history')
      .select('id')
      .eq('recipe_id', id)
      .eq('user_id', user.id)
      .eq('made_on', madeOn)
      .single()
    entryId = existing?.id ?? null
  }

  // Silent pantry deduction — fire and forget, never affects the HTTP response
  if (id) void deductPantryIngredients(id, user.id).catch(() => {})

  return NextResponse.json({ made_on: madeOn, already_logged: alreadyLogged, entry_id: entryId })
})

// Pattern for clearly singular quantities (null quantity is also deductible)
const SINGULAR_QTY_PATTERN = /^\d+\s*(can|cans|lb|lbs|oz|piece|pieces|item|items|pack|packs)$/i

async function deductPantryIngredients(recipeId: string, userId: string): Promise<void> {
  const db = createAdminClient()

  // Fetch recipe ingredients text
  const { data: recipe } = await db
    .from('recipes')
    .select('ingredients')
    .eq('id', recipeId)
    .single()

  if (!recipe?.ingredients) return

  // Parse ingredient names from each line
  const ingredientNames = recipe.ingredients
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseIngredientLine(line).rawName.toLowerCase().trim())
    .filter(Boolean)

  // Fetch all pantry items for this user
  const { data: pantryItems } = await db
    .from('pantry_items')
    .select('id, name, quantity, user_id')
    .eq('user_id', userId)

  if (!pantryItems?.length) return

  const idsToDelete: string[] = []
  for (const pantryItem of pantryItems) {
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
    await db.from('pantry_items').delete().in('id', idsToDelete)
  }
}

export const DELETE = withAuth(async (req: NextRequest, { user, db }, params) => {
  const id = params.id!

  const { data: body, error: parseError } = await parseBody(req, deleteLogSchema)
  if (parseError) return parseError

  const { error: deleteError } = await db
    .from('recipe_history')
    .delete()
    .eq('recipe_id', id)
    .eq('user_id', user.id)
    .eq('made_on', body.made_on)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
})
