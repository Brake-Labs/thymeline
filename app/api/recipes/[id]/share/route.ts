import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { shareRecipeSchema, parseBody } from '@/lib/schemas'
import { checkOwnership } from '@/lib/household'

export const PATCH = withAuth(async (req: NextRequest, { user, db, ctx }, params) => {
  const id = params.id!

  // Ownership check
  const ownership = await checkOwnership(db, 'recipes', id, user.id, ctx)
  if (!ownership.owned) {
    const msg = ownership.status === 404 ? 'Not found' : 'Forbidden'
    return NextResponse.json({ error: msg }, { status: ownership.status })
  }

  const { data: body, error: parseError } = await parseBody(req, shareRecipeSchema)
  if (parseError) return parseError

  const { data: updated, error: updateError } = await db
    .from('recipes')
    .update({ is_shared: body.is_shared })
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    console.error('Share update failed:', updateError.message, updateError.code)
    return NextResponse.json({ error: 'Failed to update share status' }, { status: 500 })
  }

  return NextResponse.json(updated)
})
