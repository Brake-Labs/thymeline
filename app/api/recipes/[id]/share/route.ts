import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { shareRecipeSchema, parseBody } from '@/lib/schemas'

export const PATCH = withAuth(async (req: NextRequest, { user, db }, params) => {
  const { id } = params

  // Ownership check
  const { data: existing, error: fetchError } = await db
    .from('recipes')
    .select('user_id')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updated)
})
