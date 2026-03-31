import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { callLLM, LLM_MODEL_FAST } from '@/lib/llm'
import { generateGroceriesSchema, parseBody } from '@/lib/schemas'
import type { RecipeJoinFull } from '@/types'
import {
  parseIngredientLine,
  combineIngredients,
  assignSection,
  isPantryStaple,
} from '@/lib/grocery'
import { resolveRecipeIngredients } from '@/lib/grocery-scrape'
import { toDateString } from '@/lib/date-utils'
import { GroceryItem, GrocerySection, RecipeScale } from '@/types'

function uuidv4(): string {
  return crypto.randomUUID()
}

interface RecipeEntry {
  recipe_id:    string
  recipe_title: string
  ingredients:  string | null
  url:          string | null
  planned_date: string
  servings:     number | null
}

// ── POST /api/groceries/generate ─────────────────────────────────────────────

export const POST = withAuth(async (req, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, generateGroceriesSchema)
  if (parseError) return parseError

  // Resolve date range — accept date_from/date_to directly, or derive from week_start
  let date_from: string
  let date_to: string
  if (body.week_start) {
    date_from = body.week_start
    const d = new Date(body.week_start + 'T12:00:00Z')
    d.setDate(d.getDate() + 6)
    date_to = toDateString(d)
  } else if (body.date_from && body.date_to) {
    date_from = body.date_from
    date_to   = body.date_to
  } else {
    return NextResponse.json({ error: 'date_from and date_to are required' }, { status: 400 })
  }

  // 1. Get all meal plan IDs for the user/household (ordered so primaryPlanId is deterministic)
  let plansQ = db.from('meal_plans').select('id').order('week_start')
  if (ctx) {
    plansQ = plansQ.eq('household_id', ctx.householdId)
  } else {
    plansQ = plansQ.eq('user_id', user.id)
  }
  const { data: plans, error: plansError } = await plansQ

  if (plansError || !plans || plans.length === 0) {
    return NextResponse.json({ error: 'No meal plans found for this date range' }, { status: 404 })
  }

  const planIds = (plans as { id: string }[]).map((p) => p.id)

  // Default plan-level servings; per-recipe override stored in recipe_scales
  const planServings = 4

  // 2. Fetch entries within date range
  const { data: entriesRaw, error: entriesError } = await db
    .from('meal_plan_entries')
    .select('recipe_id, planned_date, recipes(id, title, ingredients, url, servings)')
    .in('meal_plan_id', planIds)
    .gte('planned_date', date_from)
    .lte('planned_date', date_to)
    .order('planned_date')

  if (entriesError) {
    return NextResponse.json({ error: 'Failed to fetch plan entries' }, { status: 500 })
  }

  // Deduplicate recipes (a recipe may appear on multiple days)
  const seenRecipeIds = new Set<string>()
  const recipes: RecipeEntry[] = []
  for (const entry of (entriesRaw ?? [])) {
    const r = entry.recipes as unknown as RecipeJoinFull | null
    if (!r) continue
    if (seenRecipeIds.has(r.id)) continue
    seenRecipeIds.add(r.id)
    recipes.push({
      recipe_id:    r.id,
      recipe_title: r.title,
      ingredients:  r.ingredients,
      url:          r.url,
      planned_date: entry.planned_date,
      servings:     r.servings,
    })
  }

  // 3. Resolve ingredients per recipe (vault first, then scrape, else skip)
  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  const skipped_recipes: string[] = []
  const combineInputs: Parameters<typeof combineIngredients>[0] = []

  for (const recipe of recipes) {
    const ingredientsText = await resolveRecipeIngredients(recipe, firecrawlKey)

    if (!ingredientsText) {
      skipped_recipes.push(recipe.recipe_title)
      continue
    }

    // Parse ingredient lines — scale factor is always 1 (amounts stored at recipe native servings)
    const sf = 1
    const lines = ingredientsText.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      const parsed = parseIngredientLine(line)
      combineInputs.push({
        parsed,
        recipeTitle: recipe.recipe_title,
        scaleFactor: sf,
      })
    }
  }

  // 4. Deduplicate & combine
  const { resolved, ambiguous } = combineIngredients(combineInputs)

  // 5. Resolve ambiguous items via LLM
  const llmResolved: GroceryItem[] = []
  if (ambiguous.length > 0) {
    try {
      const ambiguousPayload = ambiguous.map(({ parsed, recipeTitle, scaleFactor }) => ({
        raw:    parsed.raw,
        name:   parsed.rawName || parsed.name,
        amount: parsed.amount !== null ? Math.round(parsed.amount * scaleFactor * 100) / 100 : null,
        unit:   parsed.unit,
        recipe: recipeTitle,
      }))

      const systemPrompt = `You are a grocery list assistant. Resolve ambiguous ingredient items.
Return ONLY valid JSON — an array of resolved GroceryItem objects.
Normalize names, reconcile units where possible, assign a section from:
Produce, Proteins, Dairy & Eggs, Pantry, Canned & Jarred, Bakery, Frozen, Other.
Mark is_pantry: true for common staples (salt, pepper, olive oil, garlic,
onion, flour, sugar, butter, common spices, vinegar, soy sauce, etc.)`

      const userPrompt = `Resolve these ambiguous grocery items:\n${JSON.stringify(ambiguousPayload, null, 2)}\n\nReturn a JSON array with objects: { name, amount, unit, section, is_pantry, recipes }`

      const rawText = await callLLM({
        model: LLM_MODEL_FAST,
        maxTokens: 2048,
        system: systemPrompt,
        user: userPrompt,
      })
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed: unknown[] = JSON.parse(cleaned)

      for (const item of parsed) {
        if (typeof item !== 'object' || item === null) continue
        const i = item as Record<string, unknown>
        const section = (typeof i.section === 'string' ? i.section : 'Other') as GrocerySection
        llmResolved.push({
          id:        uuidv4(),
          name:      typeof i.name === 'string' ? i.name : 'Unknown',
          amount:    typeof i.amount === 'number' ? i.amount : null,
          unit:      typeof i.unit === 'string' ? i.unit : null,
          section:   ['Produce','Proteins','Dairy & Eggs','Pantry','Canned & Jarred','Bakery','Frozen','Other'].includes(section) ? section : 'Other',
          is_pantry: typeof i.is_pantry === 'boolean' ? i.is_pantry : isPantryStaple(typeof i.name === 'string' ? i.name : ''),
          checked:   false,
          recipes:   Array.isArray(i.recipes) ? i.recipes.filter((r): r is string => typeof r === 'string') : [],
        })
      }
    } catch (err) {
      console.warn('LLM ambiguous resolution failed, using rule-based fallback:', err)
      // Fallback: add ambiguous items as-is
      for (const { parsed, recipeTitle, scaleFactor } of ambiguous) {
        const scaled = parsed.amount !== null ? Math.round(parsed.amount * scaleFactor * 100) / 100 : null
        llmResolved.push({
          id:        uuidv4(),
          name:      parsed.rawName || parsed.name,
          amount:    scaled,
          unit:      parsed.unit,
          section:   assignSection(parsed.name),
          is_pantry: isPantryStaple(parsed.name),
          checked:   false,
          recipes:   [recipeTitle],
        })
      }
    }
  }

  let allItems: GroceryItem[] = [...resolved, ...llmResolved]

  // 5b. Cross-reference against pantry — flag matching items as is_pantry: true
  try {
    let pantryQ = db.from('pantry_items').select('name')
    if (ctx) {
      pantryQ = pantryQ.eq('household_id', ctx.householdId)
    } else {
      pantryQ = pantryQ.eq('user_id', user.id)
    }
    const { data: pantryItems } = await pantryQ

    if (pantryItems?.length) {
      const pantryNames = (pantryItems as { name: string }[]).map((p) => p.name.toLowerCase().trim())
      allItems = allItems.map((item) => {
        const gName = item.name.toLowerCase().trim()
        const matched = pantryNames.some(
          (pName) => pName.includes(gName) || gName.includes(pName),
        )
        return matched ? { ...item, is_pantry: true } : item
      })
    }
  } catch { /* non-fatal */ }

  // 6. Build recipe_scales (all null → inherit plan default)
  const recipe_scales: RecipeScale[] = recipes.map((r) => ({
    recipe_id:    r.recipe_id,
    recipe_title: r.recipe_title,
    servings:     r.servings ?? planServings,
  }))

  // 7. Upsert grocery_lists
  const now = new Date().toISOString()
  const upsertPayload = ctx
    ? {
        household_id:  ctx.householdId,
        user_id:       user.id,
        meal_plan_id:  planIds[0],
        week_start:    date_from,
        date_from,
        date_to,
        servings:      planServings,
        recipe_scales,
        items:         allItems,
        updated_at:    now,
      }
    : {
        user_id:       user.id,
        meal_plan_id:  planIds[0],
        week_start:    date_from,
        date_from,
        date_to,
        servings:      planServings,
        recipe_scales,
        items:         allItems,
        updated_at:    now,
      }
  const onConflict = ctx ? 'household_id,week_start' : 'user_id,week_start'
  const { data: upserted, error: upsertError } = await db
    .from('grocery_lists')
    .upsert(upsertPayload, { onConflict })
    .select('*')
    .single()

  if (upsertError || !upserted) {
    console.error('Upsert error:', upsertError)
    return NextResponse.json({ error: 'Failed to save grocery list' }, { status: 500 })
  }

  return NextResponse.json({ list: upserted, skipped_recipes })
})
