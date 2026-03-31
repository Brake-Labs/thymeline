import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { importPantrySchema, parseBody } from '@/lib/schemas'
import { assignSection } from '@/lib/grocery'

// ── POST /api/pantry/import ───────────────────────────────────────────────────

export const POST = withAuth(async (req, { user, db }) => {
  const { data: body, error: parseError } = await parseBody(req, importPantrySchema)
  if (parseError) return parseError

  // Fetch existing pantry items for this user (for dedup check)
  const { data: existing } = await db
    .from('pantry_items')
    .select('id, name')
    .eq('user_id', user.id)

  // Build a map of normalized name → id for case-insensitive dedup
  const existingByName = new Map<string, string>()
  for (const item of existing ?? []) {
    existingByName.set(item.name.trim().toLowerCase(), item.id)
  }

  let imported = 0
  let updated = 0
  const now = new Date().toISOString()

  for (const item of body.items) {
    const normalizedName = item.name.trim().toLowerCase()
    const section = item.section ?? assignSection(item.name.trim())
    const existingId = existingByName.get(normalizedName)

    if (existingId) {
      // Update existing item's quantity and updated_at
      const { error } = await db
        .from('pantry_items')
        .update({ quantity: item.quantity, updated_at: now })
        .eq('id', existingId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      updated++
    } else {
      // Insert new item
      const { error } = await db.from('pantry_items').insert({
        user_id:  user.id,
        name:     item.name.trim(),
        quantity: item.quantity,
        section,
        updated_at: now,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      imported++
    }
  }

  return NextResponse.json({ imported, updated })
})
