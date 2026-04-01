import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { parseBody, importSaveSchema } from '@/lib/schemas'
import { scopeInsert, checkOwnership } from '@/lib/household'
import { FIRST_CLASS_TAGS } from '@/lib/tags'

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, importSaveSchema)
  if (parseError) return parseError

  let imported = 0
  let skipped = 0
  let replaced = 0
  const failed: { title: string; error: string }[] = []

  for (const item of body.recipes) {
    const recipe = item.data

    // Server-side guard: skip recipes with no title
    if (!recipe.title || !recipe.title.trim()) {
      failed.push({ title: '(untitled)', error: 'Missing title' })
      continue
    }

    if (item.duplicate_action === 'skip') {
      skipped++
      continue
    }

    // Separate first-class tags from unmatched
    const firstClassSet = new Set(FIRST_CLASS_TAGS.map((t) => t.toLowerCase()))
    const firstClassTags: string[] = []
    const unmatchedTags: string[] = []

    for (const tag of recipe.tags) {
      if (firstClassSet.has(tag.toLowerCase())) {
        const canonical = FIRST_CLASS_TAGS.find((t) => t.toLowerCase() === tag.toLowerCase())
        firstClassTags.push(canonical ?? tag)
      } else {
        unmatchedTags.push(tag)
      }
    }

    // Upsert unmatched tags as custom tags
    const normalizedCustomTags: string[] = []
    for (const tag of unmatchedTags) {
      const normalized = toTitleCase(tag.trim())
      if (!normalized) continue
      normalizedCustomTags.push(normalized)

      const tagPayload = scopeInsert(user.id, ctx, {
        name:    normalized,
        section: 'cuisine',
      })

      // Use upsert with ignoreDuplicates to handle ON CONFLICT DO NOTHING
      await db
        .from('custom_tags')
        .upsert(tagPayload, { onConflict: 'user_id,name', ignoreDuplicates: true })
    }

    const allTags = [...firstClassTags, ...normalizedCustomTags]

    const recipePayload = {
      title:                 recipe.title.trim(),
      category:              recipe.category ?? 'main_dish',
      ingredients:           recipe.ingredients,
      steps:                 recipe.steps,
      notes:                 recipe.notes,
      url:                   recipe.url,
      image_url:             recipe.image_url,
      prep_time_minutes:     recipe.prep_time_minutes,
      cook_time_minutes:     recipe.cook_time_minutes,
      total_time_minutes:    recipe.total_time_minutes,
      inactive_time_minutes: recipe.inactive_time_minutes,
      servings:              recipe.servings,
      tags:                  allTags,
      source:                recipe.source,
      is_shared:             false,
      step_photos:           [],
    }

    if (item.duplicate_action === 'replace' && item.existing_id) {
      // Verify ownership before updating
      const ownership = await checkOwnership(db, 'recipes', item.existing_id, user.id, ctx)
      if (!ownership.owned) {
        failed.push({ title: recipe.title, error: 'Cannot replace: recipe not found or not owned' })
        continue
      }

      const { error } = await db
        .from('recipes')
        .update(recipePayload)
        .eq('id', item.existing_id)

      if (error) {
        console.error('[import/save] Update failed:', error)
        failed.push({ title: recipe.title, error: error.message })
        continue
      }

      replaced++
    } else {
      // Insert as new recipe (keep_both or no duplicate action)
      const insertPayload = scopeInsert(user.id, ctx, recipePayload)
      const { error } = await db.from('recipes').insert(insertPayload)

      if (error) {
        console.error('[import/save] Insert failed:', error)
        failed.push({ title: recipe.title, error: error.message })
        continue
      }

      imported++
    }
  }

  return NextResponse.json({ imported, skipped, replaced, failed })
})
