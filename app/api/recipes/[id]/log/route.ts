import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-server'
import { parseIngredientLine } from '@/lib/grocery'
import { logRecipeSchema, deleteLogSchema, parseBody } from '@/lib/schemas'

export const POST = withAuth(async (req: NextRequest, { user, db }, params) => {
  const { id } = params

  // Verify the recipe exists and the user can access it
  const { data: recipe, error: fetchError } = await db
    .from('recipes')
    .select('id')
    .eq('id', id)
    .single()

  if (fetchError || !recipe) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Accept optional made_on from body; default to today
  const today = new Date().toISOString().split('T')[0]
  const { data: body } = await parseBody(req, logRecipeSchema)
  const madeOn = body?.made_on ?? today

  const { error: insertError } = await db
    .from('recipe_history')
    .insert({ recipe_id: id, user_id: user.id, made_on: madeOn })

  // Unique constraint violation = already logged today — treat as idempotent
  const alreadyLogged =
    insertError !== null &&
    (insertError.code === '23505' || insertError.message.includes('recipe_history_unique_day'))

  if (insertError && !alreadyLogged) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Silent pantry deduction — fire and forget, never affects the HTTP response
  void deductPantryIngredients(id, user.id).catch(() => {})

  return NextResponse.json({ made_on: madeOn, already_logged: alreadyLogged })
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
  const ingredientNames = (recipe.ingredients as string)
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean)
    .map((line: string) => parseIngredientLine(line).rawName.toLowerCase().trim())
    .filter(Boolean)

  // Fetch all pantry items for this user
  const { data: pantryItems } = await db
    .from('pantry_items')
    .select('id, name, quantity, user_id')
    .eq('user_id', userId)

  if (!pantryItems?.length) return

  const idsToDelete: string[] = []
  for (const pantryItem of pantryItems) {
    const pantryName = (pantryItem.name as string).toLowerCase().trim()
    const matched = ingredientNames.some(
      (ing) => pantryName.includes(ing) || ing.includes(pantryName),
    )
    if (!matched) continue

    const qty = pantryItem.quantity as string | null
    if (qty === null || SINGULAR_QTY_PATTERN.test(qty)) {
      idsToDelete.push(pantryItem.id as string)
    }
  }

  if (idsToDelete.length > 0) {
    await db.from('pantry_items').delete().in('id', idsToDelete)
  }
}

export const DELETE = withAuth(async (req: NextRequest, { user, db }, params) => {
  const { id } = params

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
