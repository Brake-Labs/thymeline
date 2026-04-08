import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { shareRecipeSchema, parseBody } from '@/lib/schemas'
import { checkOwnership } from '@/lib/household'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { recipes } from '@/lib/db/schema'
import { recipeRowToJson } from '@/lib/db/serialize'

export const PATCH = withAuth(async (req: NextRequest, { user, ctx }, params) => {
  const id = params.id!

  // Ownership check
  const ownership = await checkOwnership('recipes', id, user.id, ctx)
  if (!ownership.owned) {
    const msg = ownership.status === 404 ? 'Not found' : 'Forbidden'
    return NextResponse.json({ error: msg }, { status: ownership.status })
  }

  const { data: body, error: parseError } = await parseBody(req, shareRecipeSchema)
  if (parseError) return parseError

  try {
    const [updated] = await db
      .update(recipes)
      .set({ isShared: body.isShared })
      .where(eq(recipes.id, id))
      .returning()

    if (!updated) return NextResponse.json({ error: 'Failed to update share status' }, { status: 500 })
    return NextResponse.json(recipeRowToJson(updated))
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Failed to update share status' }, { status: 500 })
  }
})
