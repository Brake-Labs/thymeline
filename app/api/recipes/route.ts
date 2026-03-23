import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { FIRST_CLASS_TAGS } from '@/lib/tags'

export async function GET(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const tag = searchParams.get('tag')

  // Fetch own recipes + shared recipes (RLS returns both via the two policies)
  let query = supabase
    .from('recipes')
    .select('id, user_id, title, category, tags, is_shared, created_at, total_time_minutes')
    .order('created_at', { ascending: false })

  if (category) query = query.eq('category', category)
  if (tag) query = query.contains('tags', [tag])

  const { data: recipes, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Attach last_made and times_made for each recipe
  const recipeIds = (recipes ?? []).map((r) => r.id)
  const historyMap: Record<string, { last_made: string | null; times_made: number }> = {}

  if (recipeIds.length > 0) {
    const { data: history } = await supabase
      .from('recipe_history')
      .select('recipe_id, made_on')
      .in('recipe_id', recipeIds)

    for (const row of history ?? []) {
      const existing = historyMap[row.recipe_id]
      if (!existing) {
        historyMap[row.recipe_id] = { last_made: row.made_on, times_made: 1 }
      } else {
        existing.times_made += 1
        if (row.made_on > (existing.last_made ?? '')) {
          existing.last_made = row.made_on
        }
      }
    }
  }

  const result = (recipes ?? []).map((r) => ({
    ...r,
    last_made: historyMap[r.id]?.last_made ?? null,
    times_made: historyMap[r.id]?.times_made ?? 0,
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    title?: string
    category?: string
    tags?: string[]
    ingredients?: string | null
    steps?: string | null
    notes?: string | null
    url?: string | null
    image_url?: string | null
    prep_time_minutes?: number | null
    cook_time_minutes?: number | null
    total_time_minutes?: number | null
    inactive_time_minutes?: number | null
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  const validCategories = ['main_dish', 'breakfast', 'dessert', 'side_dish']
  if (!body.category || !validCategories.includes(body.category)) {
    return NextResponse.json({ error: 'category is required and must be one of: main_dish, breakfast, dessert, side_dish' }, { status: 400 })
  }

  const tags = body.tags ?? []

  // Validate tags against first-class list + user's custom_tags
  if (tags.length > 0) {
    const { data: customTags } = await supabase
      .from('custom_tags')
      .select('name')
      .eq('user_id', user.id)

    const knownNames = new Set([
      ...FIRST_CLASS_TAGS.map((t) => t.toLowerCase()),
      ...(customTags ?? []).map((t: { name: string }) => t.name.toLowerCase()),
    ])
    const unknownTags = tags.filter((t) => !knownNames.has(t.toLowerCase()))
    if (unknownTags.length > 0) {
      return NextResponse.json(
        { error: `Unknown tags: ${unknownTags.join(', ')}` },
        { status: 400 },
      )
    }
  }

  const { data, error } = await supabase
    .from('recipes')
    .insert({
      user_id: user.id,
      title: body.title,
      category: body.category,
      tags,
      ingredients: body.ingredients ?? null,
      steps: body.steps ?? null,
      notes: body.notes ?? null,
      url: body.url ?? null,
      image_url: body.image_url ?? null,
      is_shared: false,
      prep_time_minutes: body.prep_time_minutes ?? null,
      cook_time_minutes: body.cook_time_minutes ?? null,
      total_time_minutes: body.total_time_minutes ?? null,
      inactive_time_minutes: body.inactive_time_minutes ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
