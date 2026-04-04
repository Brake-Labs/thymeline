import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { patchLogSchema, parseBody } from '@/lib/schemas'

export const PATCH = withAuth(async (req: NextRequest, { user, db }, params) => {
  const recipeId = params.id!
  const entryId  = params.entry_id!

  const { data: body, error } = await parseBody(req, patchLogSchema)
  if (error) return error

  // Verify the entry belongs to this user and matches the recipe
  const { data: entry } = await db
    .from('recipe_history')
    .select('id')
    .eq('id', entryId)
    .eq('recipe_id', recipeId)
    .eq('user_id', user.id)
    .single()

  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db
    .from('recipe_history')
    .update({ make_again: body.make_again })
    .eq('id', entryId)

  return NextResponse.json({ id: entryId, make_again: body.make_again })
})
