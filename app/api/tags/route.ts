import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { FIRST_CLASS_TAGS } from '@/lib/tags'

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('custom_tags')
    .select('name, section')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const firstClassLower = new Set(FIRST_CLASS_TAGS.map((t) => t.toLowerCase()))
  // Filter out any custom tags that duplicate a first-class tag (stale DB entries)
  const custom = (data ?? [])
    .filter((t: { name: string }) => !firstClassLower.has(t.name.toLowerCase()))
    .map((t: { name: string; section: string }) => ({ name: t.name, section: t.section }))

  return NextResponse.json({ firstClass: FIRST_CLASS_TAGS, custom })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name?: string; section?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const raw = body.name?.trim()
  const validSections = ['style', 'dietary', 'seasonal', 'cuisine', 'protein']
  const section = validSections.includes(body.section ?? '') ? body.section! : 'cuisine'
  if (!raw) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const normalized = toTitleCase(raw)
  const lc = normalized.toLowerCase()

  // Reject if it matches a first-class tag (case-insensitive)
  const firstClassMatch = FIRST_CLASS_TAGS.find((t) => t.toLowerCase() === lc)
  if (firstClassMatch) {
    return NextResponse.json(
      { error: `'${firstClassMatch}' is a built-in tag and cannot be added as a custom tag.` },
      { status: 400 },
    )
  }

  // Check for duplicate custom tag (case-insensitive)
  const { data: existing } = await supabase
    .from('custom_tags')
    .select('id, name')
    .eq('user_id', user.id)

  const duplicate = (existing ?? []).find((t: { name: string }) => t.name.toLowerCase() === lc)
  if (duplicate) {
    return NextResponse.json({ error: 'Tag already exists' }, { status: 409 })
  }

  const { data: created, error: insertError } = await supabase
    .from('custom_tags')
    .insert({ user_id: user.id, name: normalized, section })
    .select('id, name, section')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json(created, { status: 201 })
}
