import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { assignSection } from '@/lib/grocery'

interface ImportItem {
  name: string
  quantity: string | null
  section: string | null
}

// ── POST /api/pantry/import ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { items?: ImportItem[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  const db = createAdminClient()

  // Fetch existing pantry items for this user (for dedup check)
  const { data: existing } = await db
    .from('pantry_items')
    .select('id, name')
    .eq('user_id', user.id)

  // Build a map of normalized name → id for case-insensitive dedup
  const existingByName = new Map<string, string>()
  for (const item of (existing ?? []) as { id: string; name: string }[]) {
    existingByName.set(item.name.trim().toLowerCase(), item.id)
  }

  let imported = 0
  let updated = 0
  const now = new Date().toISOString()

  for (const item of body.items) {
    if (!item.name || typeof item.name !== 'string') continue
    const normalizedName = item.name.trim().toLowerCase()
    const section = item.section ?? assignSection(item.name.trim())
    const existingId = existingByName.get(normalizedName)

    if (existingId) {
      // Update existing item's quantity and updated_at
      await db
        .from('pantry_items')
        .update({ quantity: item.quantity, updated_at: now })
        .eq('id', existingId)
      updated++
    } else {
      // Insert new item
      await db.from('pantry_items').insert({
        user_id:  user.id,
        name:     item.name.trim(),
        quantity: item.quantity,
        section,
        updated_at: now,
      })
      imported++
    }
  }

  return NextResponse.json({ imported, updated })
}
