import { NextRequest, NextResponse } from 'next/server'
import FirecrawlApp from 'firecrawl'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { anthropic } from '@/lib/llm'
import {
  parseIngredientLine,
  combineIngredients,
  assignSection,
  isPantryStaple,
} from '@/lib/grocery'
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
}

// ── POST /api/groceries/generate ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { week_start?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { week_start } = body
  if (!week_start) {
    return NextResponse.json({ error: 'week_start is required' }, { status: 400 })
  }

  // 1. Look up meal plan
  const db = createAdminClient()
  const { data: plan, error: planError } = await db
    .from('meal_plans')
    .select('id, people_count')
    .eq('user_id', user.id)
    .eq('week_start', week_start)
    .single()

  if (planError || !plan) {
    return NextResponse.json({ error: 'No meal plan found for this week' }, { status: 404 })
  }

  const planPeopleCount: number = (plan as { id: string; people_count?: number }).people_count ?? 2

  // 2. Fetch meal plan entries joined with recipes
  const { data: entriesRaw, error: entriesError } = await db
    .from('meal_plan_entries')
    .select('recipe_id, planned_date, recipes(id, title, ingredients, url)')
    .eq('meal_plan_id', plan.id)
    .order('planned_date')

  if (entriesError) {
    return NextResponse.json({ error: 'Failed to fetch plan entries' }, { status: 500 })
  }

  // Deduplicate recipes (a recipe may appear on multiple days)
  const seenRecipeIds = new Set<string>()
  const recipes: RecipeEntry[] = []
  for (const entry of (entriesRaw ?? [])) {
    const r = (entry.recipes as unknown) as { id: string; title: string; ingredients: string | null; url: string | null } | null
    if (!r) continue
    if (seenRecipeIds.has(r.id)) continue
    seenRecipeIds.add(r.id)
    recipes.push({
      recipe_id:    r.id,
      recipe_title: r.title,
      ingredients:  r.ingredients,
      url:          r.url,
      planned_date: entry.planned_date,
    })
  }

  // 3. Resolve ingredients per recipe (vault first, then scrape, else skip)
  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  const skipped_recipes: string[] = []
  const combineInputs: Parameters<typeof combineIngredients>[0] = []

  const scaleFactor = (recipeId: string) => planPeopleCount / 2  // per-recipe override not yet set on generate

  for (const recipe of recipes) {
    let ingredientsText: string | null = null

    if (recipe.ingredients) {
      // Vault ingredients available
      ingredientsText = recipe.ingredients
    } else if (recipe.url && firecrawlKey) {
      // Attempt scrape + LLM extraction
      try {
        const firecrawl = new FirecrawlApp({ apiKey: firecrawlKey })
        const result = await firecrawl.scrape(recipe.url, { formats: ['markdown'] })
        const pageContent = result.markdown ?? ''

        const extractionPrompt = `Extract the ingredients list from this recipe page. Return ONLY a JSON object with a single field "ingredients": a newline-separated string of ingredients (one per line), or null if not found.\n\nPage content:\n${pageContent.slice(0, 10000)}`

        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          temperature: 0,
          messages: [{ role: 'user', content: extractionPrompt }],
        })

        const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        const parsed = JSON.parse(cleaned)
        if (typeof parsed.ingredients === 'string') {
          ingredientsText = parsed.ingredients
        }
      } catch (err) {
        console.warn(`Failed to scrape/extract ingredients for "${recipe.recipe_title}":`, err)
      }
    }

    if (!ingredientsText) {
      skipped_recipes.push(recipe.recipe_title)
      continue
    }

    // Parse ingredient lines
    const sf = scaleFactor(recipe.recipe_id)
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
  let llmResolved: GroceryItem[] = []
  if (ambiguous.length > 0) {
    try {
      const ambiguousPayload = ambiguous.map(({ parsed, recipeTitle, scaleFactor }) => ({
        raw:          parsed.raw,
        name:         parsed.rawName || parsed.name,
        amount:       parsed.amount !== null ? Math.round(parsed.amount * scaleFactor * 100) / 100 : null,
        unit:         parsed.unit,
        recipe:       recipeTitle,
      }))

      const systemPrompt = `You are a grocery list assistant. Resolve ambiguous ingredient items.
Return ONLY valid JSON — an array of resolved GroceryItem objects.
Normalize names, reconcile units where possible, assign a section from:
Produce, Proteins, Dairy & Eggs, Pantry, Canned & Jarred, Bakery, Frozen, Other.
Mark is_pantry: true for common staples (salt, pepper, olive oil, garlic,
onion, flour, sugar, butter, common spices, vinegar, soy sauce, etc.)`

      const userPrompt = `Resolve these ambiguous grocery items:\n${JSON.stringify(ambiguousPayload, null, 2)}\n\nReturn a JSON array with objects: { name, amount, unit, section, is_pantry, recipes }`

      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        temperature: 0,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      })

      const rawText = response.content[0].type === 'text' ? response.content[0].text : '[]'
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

  const allItems: GroceryItem[] = [...resolved, ...llmResolved]

  // 6. Build recipe_scales (all null → inherit plan default)
  const recipe_scales: RecipeScale[] = recipes.map((r) => ({
    recipe_id:    r.recipe_id,
    recipe_title: r.recipe_title,
    people_count: null,
  }))

  // 7. Upsert grocery_lists
  const now = new Date().toISOString()
  const { data: upserted, error: upsertError } = await db
    .from('grocery_lists')
    .upsert(
      {
        user_id:       user.id,
        meal_plan_id:  plan.id,
        week_start,
        people_count:  planPeopleCount,
        recipe_scales,
        items:         allItems,
        updated_at:    now,
      },
      { onConflict: 'user_id,week_start' },
    )
    .select('*')
    .single()

  if (upsertError || !upserted) {
    console.error('Upsert error:', upsertError)
    return NextResponse.json({ error: 'Failed to save grocery list' }, { status: 500 })
  }

  return NextResponse.json({ list: upserted, skipped_recipes })
}
