import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { callLLM, LLM_MODEL_CAPABLE } from '@/lib/llm'
import { generateGroceriesSchema, parseBody } from '@/lib/schemas'
import { logger } from '@/lib/logger'
import {
  parseIngredientLine,
  combineIngredients,
  deduplicateItems,
  assignSection,
  isPantryStaple,
  isWaterIngredient,
  roundToPurchaseUnits,
  suppressStapleQuantities,
} from '@/lib/grocery'
import { llmDeduplicateItems } from '@/lib/grocery-llm'
import { resolveRecipeIngredients } from '@/lib/grocery-scrape'
import { db } from '@/lib/db'
import { eq, and, gte, lte, inArray, asc } from 'drizzle-orm'
import { mealPlans, mealPlanEntries, recipes, groceryLists, pantryItems } from '@/lib/db/schema'
import { scopeCondition, scopeInsert } from '@/lib/household'
import { toDateString } from '@/lib/date-utils'
import { GroceryItem, RecipeScale } from '@/types'

function uuidv4(): string {
  return crypto.randomUUID()
}

interface RecipeEntry {
  recipeId:    string
  recipeTitle: string
  ingredients:  string | null
  url:          string | null
  plannedDate: string
  servings:     number | null
}

// ── POST /api/groceries/generate ─────────────────────────────────────────────

export const POST = withAuth(async (req, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, generateGroceriesSchema)
  if (parseError) return parseError

  // Resolve date range — accept dateFrom/dateTo directly, or derive from weekStart
  let dateFrom: string
  let dateTo: string
  if (body.weekStart) {
    dateFrom = body.weekStart
    const d = new Date(body.weekStart + 'T12:00:00Z')
    d.setDate(d.getDate() + 6)
    dateTo = toDateString(d)
  } else if (body.dateFrom && body.dateTo) {
    dateFrom = body.dateFrom
    dateTo   = body.dateTo
  } else {
    return NextResponse.json({ error: 'dateFrom and dateTo are required' }, { status: 400 })
  }

  // 1. Get all meal plan IDs for the user/household (ordered so primaryPlanId is deterministic)
  const planRows = await db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(scopeCondition(
      { userId: mealPlans.userId, householdId: mealPlans.householdId },
      user.id,
      ctx,
    ))
    .orderBy(asc(mealPlans.weekStart))

  if (planRows.length === 0) {
    logger.warn({ userId: user.id, dateFrom, dateTo }, 'no meal plans found for grocery generation')
    return NextResponse.json({ error: 'No meal plans found for this date range' }, { status: 404 })
  }

  const planIds = planRows.map((p) => p.id)

  // Default plan-level servings; per-recipe override stored in recipeScales
  const planServings = 4

  // 2. Fetch entries within date range
  const entriesRaw = await db
    .select({
      recipeId: mealPlanEntries.recipeId,
      plannedDate: mealPlanEntries.plannedDate,
      recipeDbId: recipes.id,
      recipeTitle: recipes.title,
      recipeIngredients: recipes.ingredients,
      recipeUrl: recipes.url,
      recipeServings: recipes.servings,
    })
    .from(mealPlanEntries)
    .innerJoin(recipes, eq(mealPlanEntries.recipeId, recipes.id))
    .where(and(
      inArray(mealPlanEntries.mealPlanId, planIds),
      gte(mealPlanEntries.plannedDate, dateFrom),
      lte(mealPlanEntries.plannedDate, dateTo),
    ))
    .orderBy(asc(mealPlanEntries.plannedDate))

  // Deduplicate recipes (a recipe may appear on multiple days)
  const seenRecipeIds = new Set<string>()
  const recipeEntries: RecipeEntry[] = []
  for (const entry of entriesRaw) {
    if (!entry.recipeDbId) continue
    if (seenRecipeIds.has(entry.recipeDbId)) continue
    seenRecipeIds.add(entry.recipeDbId)
    recipeEntries.push({
      recipeId:    entry.recipeDbId,
      recipeTitle: entry.recipeTitle,
      ingredients:  entry.recipeIngredients,
      url:          entry.recipeUrl,
      plannedDate: entry.plannedDate,
      servings:     entry.recipeServings,
    })
  }

  logger.debug({ recipeCount: recipeEntries.length, dateFrom, dateTo }, 'grocery generation: entries fetched')

  // 3. Resolve ingredients per recipe (vault first, then scrape, else skip)
  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  const skippedRecipes: string[] = []
  const combineInputs: Parameters<typeof combineIngredients>[0] = []

  for (const recipe of recipeEntries) {
    const ingredientsText = await resolveRecipeIngredients(recipe, firecrawlKey)

    if (!ingredientsText) {
      logger.debug({ recipeTitle: recipe.recipeTitle, recipeId: recipe.recipeId }, 'recipe skipped — no ingredients resolved')
      skippedRecipes.push(recipe.recipeTitle)
      continue
    }

    // Parse ingredient lines — scale factor is always 1 (amounts stored at recipe native servings)
    const sf = 1
    const lines = ingredientsText.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      const parsed = parseIngredientLine(line)
      // Water (with any temperature modifier) is never a grocery item
      if (isWaterIngredient(parsed.name)) continue
      combineInputs.push({
        parsed,
        recipeTitle: recipe.recipeTitle,
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
Produce, Proteins, Dairy & Eggs, Deli, Pantry, Canned & Jarred, Bakery, Beverages, Frozen, Other.
Mark isPantry: true for common staples (salt, pepper, olive oil, garlic,
onion, flour, sugar, butter, common spices, vinegar, soy sauce, etc.)`

      const userPrompt = `Resolve these ambiguous grocery items:\n${JSON.stringify(ambiguousPayload, null, 2)}\n\nReturn a JSON array with objects: { name, amount, unit, section, isPantry, recipes }`

      const rawText = await callLLM({
        model: LLM_MODEL_CAPABLE,
        maxTokens: 2048,
        system: systemPrompt,
        user: userPrompt,
      })
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed: unknown[] = JSON.parse(cleaned)

      for (const item of parsed) {
        if (typeof item !== 'object' || item === null) continue
        const i = item as Record<string, unknown>
        const itemName = typeof i.name === 'string' ? i.name : 'Unknown'
        llmResolved.push({
          id:        uuidv4(),
          name:      itemName,
          amount:    typeof i.amount === 'number' ? i.amount : null,
          unit:      typeof i.unit === 'string' ? i.unit : null,
          // Always use rule-based section assignment — LLM assignments are unreliable
          // (e.g. bratwurst → Other, cheddar → Pantry instead of correct sections).
          section:   assignSection(itemName),
          isPantry: isPantryStaple(itemName),
          checked:   false,
          recipes:   Array.isArray(i.recipes) ? i.recipes.filter((r): r is string => typeof r === 'string') : [],
        })
      }
    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.message : String(err), ambiguousCount: ambiguous.length }, 'LLM ambiguous resolution failed, using rule-based fallback')
      // Fallback: add ambiguous items as-is
      for (const { parsed, recipeTitle, scaleFactor } of ambiguous) {
        const scaled = parsed.amount !== null ? Math.round(parsed.amount * scaleFactor * 100) / 100 : null
        llmResolved.push({
          id:        uuidv4(),
          name:      parsed.rawName || parsed.name,
          amount:    scaled,
          unit:      parsed.unit,
          section:   assignSection(parsed.name),
          isPantry: isPantryStaple(parsed.name),
          checked:   false,
          recipes:   [recipeTitle],
        })
      }
    }
  }

  // Final dedup pass: resolved + llmResolved can still contain same-name items
  // when some occurrences of an ingredient merged in the rule pass (same unit)
  // and another occurrence came back from the LLM as a separate entry.
  let allItems: GroceryItem[] = deduplicateItems([...resolved, ...llmResolved])

  // LLM-assisted semantic dedup (spec 26): catches duplicates the rule-based
  // normalizer missed (e.g. "boneless skinless chicken breast" = "chicken breast").
  // Must run BEFORE rounding so merged amounts get rounded once.
  allItems = await llmDeduplicateItems(allItems)

  // Post-processing: round to natural purchase units, suppress pantry staple quantities
  allItems = roundToPurchaseUnits(allItems)
  allItems = suppressStapleQuantities(allItems)

  // 5b. Cross-reference against pantry — flag matching items as isPantry: true
  try {
    const pantryRows = await db
      .select({ name: pantryItems.name })
      .from(pantryItems)
      .where(scopeCondition(
        { userId: pantryItems.userId, householdId: pantryItems.householdId },
        user.id,
        ctx,
      ))

    if (pantryRows.length) {
      const pantryNames = pantryRows.map((p) => p.name.toLowerCase().trim())
      allItems = allItems.map((item) => {
        const gName = item.name.toLowerCase().trim()
        const matched = pantryNames.some(
          (pName) => pName.includes(gName) || gName.includes(pName),
        )
        return matched ? { ...item, isPantry: true } : item
      })
    }
  } catch (err) {
    logger.debug({ error: err instanceof Error ? err.message : String(err) }, 'pantry cross-reference failed (non-fatal)')
  }

  // 6. Build recipeScales (all null → inherit plan default)
  const recipeScales: RecipeScale[] = recipeEntries.map((r) => ({
    recipeId:    r.recipeId,
    recipeTitle: r.recipeTitle,
    servings:     r.servings ?? planServings,
  }))

  // 7. Upsert grocery_lists
  const now = new Date()
  const upsertPayload = {
    ...scopeInsert(user.id, ctx),
    mealPlanId:  planIds[0],
    weekStart:   dateFrom,
    dateFrom:    dateFrom,
    dateTo:      dateTo,
    servings:    planServings,
    recipeScales: recipeScales,
    items:       allItems,
    updatedAt:   now,
  }

  try {
    // Check if a row exists for this scope + weekStart
    const existingRows = await db
      .select({ id: groceryLists.id })
      .from(groceryLists)
      .where(and(
        eq(groceryLists.weekStart, dateFrom),
        scopeCondition({ userId: groceryLists.userId, householdId: groceryLists.householdId }, user.id, ctx),
      ))
      .limit(1)

    let upserted
    if (existingRows.length > 0) {
      // Update existing
      const [updated] = await db
        .update(groceryLists)
        .set(upsertPayload)
        .where(eq(groceryLists.id, existingRows[0]!.id))
        .returning()
      upserted = updated
    } else {
      // Insert new
      const [inserted] = await db
        .insert(groceryLists)
        .values(upsertPayload)
        .returning()
      upserted = inserted
    }

    if (!upserted) {
      return NextResponse.json({ error: 'Failed to save grocery list' }, { status: 500 })
    }

    logger.info({ listId: upserted.id, itemCount: allItems.length, recipeCount: recipeEntries.length, skipped: skippedRecipes.length }, 'grocery list generated')
    return NextResponse.json({ list: upserted, skippedRecipes })
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : String(err), dateFrom, userId: user.id }, 'failed to upsert grocery list')
    return NextResponse.json({ error: 'Failed to save grocery list' }, { status: 500 })
  }
})
