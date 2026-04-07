import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { parseBody, importSaveSchema } from '@/lib/schemas'
import { scopeInsert, checkOwnership } from '@/lib/household'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { recipes, customTags } from '@/lib/db/schema'

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

export const POST = withAuth(async (req: NextRequest, { user, ctx }) => {
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

      try {
        await db
          .insert(customTags)
          .values({
            name: normalized,
            section: 'cuisine',
            ...scopeInsert(user.id, ctx),
          })
          .onConflictDoNothing()
      } catch {
        // Ignore duplicate tag errors
      }
    }

    const allTags = [...firstClassTags, ...normalizedCustomTags]

    const recipePayload = {
      title:              recipe.title.trim(),
      category:           recipe.category ?? 'main_dish',
      ingredients:        recipe.ingredients,
      steps:              recipe.steps,
      notes:              recipe.notes,
      url:                recipe.url,
      imageUrl:           recipe.image_url,
      prepTimeMinutes:    recipe.prep_time_minutes,
      cookTimeMinutes:    recipe.cook_time_minutes,
      totalTimeMinutes:   recipe.total_time_minutes,
      inactiveTimeMinutes: recipe.inactive_time_minutes,
      servings:           recipe.servings,
      tags:               allTags,
      source:             recipe.source,
      isShared:           false,
      stepPhotos:         [],
    }

    if (item.duplicate_action === 'replace' && item.existing_id) {
      // Verify ownership before updating
      const ownership = await checkOwnership('recipes', item.existing_id, user.id, ctx)
      if (!ownership.owned) {
        failed.push({ title: recipe.title, error: 'Cannot replace: recipe not found or not owned' })
        continue
      }

      try {
        await db
          .update(recipes)
          .set(recipePayload)
          .where(eq(recipes.id, item.existing_id))
        replaced++
      } catch (err) {
        console.error('[import/save] Update failed:', err)
        failed.push({ title: recipe.title, error: 'Failed to replace recipe' })
      }
    } else {
      // Insert as new recipe (keep_both or no duplicate action)
      try {
        await db
          .insert(recipes)
          .values({
            ...recipePayload,
            ...scopeInsert(user.id, ctx),
          })
        imported++
      } catch (err) {
        console.error('[import/save] Insert failed:', err)
        failed.push({ title: recipe.title, error: 'Failed to import recipe' })
      }
    }
  }

  return NextResponse.json({ imported, skipped, replaced, failed })
})
