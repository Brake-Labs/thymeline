import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { patchLogSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { recipeHistory } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'

export const PATCH = withAuth(async (req: NextRequest, { user }, params) => {
  const recipeId = params.id!
  const entryId = params.entry_id!

  const { data: body, error } = await parseBody(req, patchLogSchema)
  if (error) return error

  try {
    // Verify the entry belongs to this user and matches the recipe
    const rows = await db
      .select({ id: recipeHistory.id })
      .from(recipeHistory)
      .where(
        and(
          eq(recipeHistory.id, entryId),
          eq(recipeHistory.recipeId, recipeId),
          eq(recipeHistory.userId, user.id),
        ),
      )

    const entry = dbFirst(rows)

    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await db
      .update(recipeHistory)
      .set({ makeAgain: body.makeAgain })
      .where(eq(recipeHistory.id, entryId))

    return NextResponse.json({ id: entryId, makeAgain: body.makeAgain })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
  }
})
