import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { FIRST_CLASS_TAGS } from '@/lib/tags'

interface RouteContext {
  params: { id: string }
}

// Helper: attach last_made + times_made to a recipe row
async function withHistory(
  supabase: ReturnType<typeof createServerClient>,
  recipe: Record<string, unknown>,
) {
  const { data: history } = await supabase
    .from('recipe_history')
    .select('made_on')
    .eq('recipe_id', recipe.id as string)

  const rows = history ?? []
  const last_made = rows.reduce<string | null>((max, r) => {
    if (!max) return r.made_on as string
    return (r.made_on as string) > max ? (r.made_on as string) : max
  }, null)
  const dates_made = rows.map((r) => r.made_on as string).sort().reverse()

  return { ...recipe, last_made, times_made: rows.length, dates_made }
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !recipe) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(await withHistory(supabase, recipe))
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Ownership check
  const { data: existing, error: fetchError } = await supabase
    .from('recipes')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    servings?: number | null
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate tags against first-class list + user's custom_tags
  if (body.tags !== undefined && body.tags.length > 0) {
    const { data: customTags } = await supabase
      .from('custom_tags')
      .select('name')
      .eq('user_id', user.id)

    const knownNames = new Set([
      ...FIRST_CLASS_TAGS.map((t) => t.toLowerCase()),
      ...(customTags ?? []).map((t: { name: string }) => t.name.toLowerCase()),
    ])
    const unknownTags = body.tags.filter((t) => !knownNames.has(t.toLowerCase()))
    if (unknownTags.length > 0) {
      return NextResponse.json(
        { error: `Unknown tags: ${unknownTags.join(', ')}` },
        { status: 400 },
      )
    }
  }

  const validCategories = ['main_dish', 'breakfast', 'dessert', 'side_dish']
  if (body.category !== undefined && !validCategories.includes(body.category)) {
    return NextResponse.json(
      { error: 'category must be one of: main_dish, breakfast, dessert, side_dish' },
      { status: 400 },
    )
  }

  // Build update payload — only fields present in the request
  const update: Record<string, unknown> = {}
  if (body.title !== undefined) update.title = body.title
  if (body.category !== undefined) update.category = body.category
  if (body.tags !== undefined) update.tags = body.tags
  if ('ingredients' in body) update.ingredients = body.ingredients
  if ('steps' in body) update.steps = body.steps
  if ('notes' in body) update.notes = body.notes
  if ('url' in body) update.url = body.url
  if ('image_url' in body) update.image_url = body.image_url
  if ('prep_time_minutes' in body) update.prep_time_minutes = body.prep_time_minutes
  if ('cook_time_minutes' in body) update.cook_time_minutes = body.cook_time_minutes
  if ('total_time_minutes' in body) update.total_time_minutes = body.total_time_minutes
  if ('inactive_time_minutes' in body) update.inactive_time_minutes = body.inactive_time_minutes
  if ('servings' in body) update.servings = body.servings

  const { data: updated, error: updateError } = await supabase
    .from('recipes')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Ownership check
  const { data: existing, error: fetchError } = await supabase
    .from('recipes')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: deleteError } = await supabase
    .from('recipes')
    .delete()
    .eq('id', params.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
