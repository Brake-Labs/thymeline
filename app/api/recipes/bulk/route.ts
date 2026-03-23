import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { FIRST_CLASS_TAGS } from '@/lib/tags'

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { recipe_ids?: string[]; add_tags?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const recipeIds = body.recipe_ids ?? []
  const addTags = body.add_tags ?? []

  if (recipeIds.length === 0) {
    return NextResponse.json({ error: 'recipe_ids is required and must be non-empty' }, { status: 400 })
  }

  // Fetch all requested recipes
  const { data: recipes, error: fetchError } = await supabase
    .from('recipes')
    .select('id, user_id, tags')
    .in('id', recipeIds)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const found = recipes ?? []

  // Verify all IDs belong to this user
  const forbidden = found.some((r) => r.user_id !== user.id)
  if (forbidden || found.length !== recipeIds.length) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate add_tags against user's tag library
  if (addTags.length > 0) {
    const { data: customTags } = await supabase
      .from('custom_tags')
      .select('name')
      .eq('user_id', user.id)

    const knownNames = new Set([
      ...FIRST_CLASS_TAGS.map((t) => t.toLowerCase()),
      ...(customTags ?? []).map((t: { name: string }) => t.name.toLowerCase()),
    ])
    const unknownTags = addTags.filter((t) => !knownNames.has(t.toLowerCase()))
    if (unknownTags.length > 0) {
      return NextResponse.json({ error: `Unknown tags: ${unknownTags.join(', ')}` }, { status: 400 })
    }
  }

  // Merge tags for each recipe and update
  const updates = found.map((r) => {
    const existing = r.tags ?? []
    const merged = [...existing]
    for (const tag of addTags) {
      if (!merged.includes(tag)) merged.push(tag)
    }
    return { id: r.id, tags: merged }
  })

  const updatePromises = updates.map(({ id, tags }) =>
    supabase.from('recipes').update({ tags }).eq('id', id).select().single()
  )

  const results = await Promise.all(updatePromises)
  const errors = results.filter((r) => r.error)
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0].error?.message }, { status: 500 })
  }

  const updatedRecipes = results.map((r) => r.data)
  return NextResponse.json(updatedRecipes)
}
