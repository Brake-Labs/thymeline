import { NextRequest, NextResponse } from 'next/server'
import FirecrawlApp from 'firecrawl'
import { withAuth } from '@/lib/auth'
import { callLLM, LLM_MODEL_FAST } from '@/lib/llm'
import { scopeCondition } from '@/lib/household'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { scrapeRecipeSchema, parseBody } from '@/lib/schemas'
import { db } from '@/lib/db'
import { customTags } from '@/lib/db/schema'

function isBlockedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    const host = u.hostname.toLowerCase()

    // Block localhost variants
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true

    // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
    if (/^10\./.test(host)) return true
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
    if (/^192\.168\./.test(host)) return true

    // Block link-local and metadata endpoints (169.254.x — AWS/GCP metadata)
    if (/^169\.254\./.test(host)) return true

    // Block non-http(s) schemes
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true

    return false
  } catch {
    return true
  }
}

export const POST = withAuth(async (req: NextRequest, { user, ctx }) => {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  if (!firecrawlKey) {
    console.error('FIRECRAWL_API_KEY is not set')
    return NextResponse.json({ error: 'Scraping service not configured' }, { status: 500 })
  }

  const { data: body, error: parseError } = await parseBody(req, scrapeRecipeSchema)
  if (parseError) return parseError
  const rawUrl = body.url

  if (isBlockedUrl(rawUrl)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 400 })
  }

  let pageContent: string
  try {
    const firecrawl = new FirecrawlApp({ apiKey: firecrawlKey })
    const result = await firecrawl.scrape(rawUrl, { formats: ['markdown'] })
    pageContent = result.markdown ?? ''
  } catch (err) {
    console.error('Firecrawl error:', err)
    return NextResponse.json({ error: 'Failed to fetch URL content' }, { status: 500 })
  }

  // Fetch user's custom tags for tag suggestion matching
  try {
    const userCustomTagRows = await db
      .select({ name: customTags.name })
      .from(customTags)
      .where(scopeCondition({ userId: customTags.userId, householdId: customTags.householdId }, user.id, ctx))

    const userCustomTags: string[] = userCustomTagRows.map((t) => t.name)

    // Extract recipe data via LLM
    const firstClassList = FIRST_CLASS_TAGS.join(', ')
    const extractionPrompt = `You are a recipe extraction assistant. Extract recipe information from the following web page content and return ONLY a JSON object with no markdown formatting.

The JSON must have exactly these fields:
- "title": string or null (the recipe name)
- "ingredients": string or null (all ingredients, one per line, newline-separated)
- "steps": string or null (cooking steps, one per line, plain text without numbering — numbering is a display concern)
- "imageUrl": string or null (URL of the main recipe image if present)
- "suggestedTags": array of strings. ONLY use tags from this exact list: ${firstClassList}. Keep total to 6 or fewer. Never suggest protein tags that don't apply to this recipe. Tag definitions: "Quick" = total prep + cook time is 30 minutes or less. Cuisine tags (Italian, Mexican, Thai, Indian, Greek, French, Middle Eastern, American, Chinese, Japanese, Irish, Hungarian, Mediterranean) — apply only when the recipe's cuisine is clearly identifiable. Dietary tags (Vegetarian, Vegan, Gluten-Free, Dairy-Free, Keto, Paleo, Whole30, etc.) — apply only when the recipe clearly qualifies. Do NOT invent tags outside this list — use suggestedNewTags for that.
- "suggestedNewTags": array of objects {name: string, section: string}. ONLY include a tag here if it is strongly relevant and does not exist in the list above. section must be one of: style, dietary, seasonal, cuisine, protein. Keep to 1 or fewer new tags. If nothing is needed, return an empty array.
- "servings": number of servings this recipe makes as an integer, or null
- "prepTimeMinutes": prep time in minutes as an integer, or null
- "cookTimeMinutes": cook time in minutes as an integer, or null
- "totalTimeMinutes": total time in minutes as an integer, or null
- "inactiveTimeMinutes": inactive/rest/marinate time in minutes as an integer, or null
- "stepPhotos": array of objects with shape {"stepIndex": number, "imageUrl": string} — 0-based index into the steps lines. [] if none.
- "category": one of "main_dish", "breakfast", "dessert", "side_dish", or null. "main_dish" = lunch/dinner entrees; "breakfast" = morning meals (pancakes, eggs, etc.); "dessert" = sweet treats (cakes, cookies, ice cream, etc.); "side_dish" = accompaniments (salads, roasted vegetables, bread, etc.).

If a field cannot be found, set it to null (or [] for arrays). Do not invent data.

Note: cooking steps may appear after a long ingredients list or narrative content. Look for sections labeled "Instructions", "Directions", "Method", or "Steps".

Page content:
${pageContent.slice(0, 20000)}`

    type RawNewTag = { name: string; section: string }
    type StepPhoto = { stepIndex: number; imageUrl: string }

    const VALID_CATEGORIES = new Set(['main_dish', 'breakfast', 'dessert', 'side_dish'])

    let extracted: {
      title: string | null
      ingredients: string | null
      steps: string | null
      imageUrl: string | null
      category: 'main_dish' | 'breakfast' | 'dessert' | 'side_dish' | null
      suggestedTags: string[]
      suggestedNewTags: RawNewTag[]
      servings: number | null
      prepTimeMinutes: number | null
      cookTimeMinutes: number | null
      totalTimeMinutes: number | null
      inactiveTimeMinutes: number | null
      stepPhotos: StepPhoto[]
    } = {
      title: null,
      ingredients: null,
      steps: null,
      imageUrl: null,
      category: null,
      suggestedTags: [],
      suggestedNewTags: [],
      servings: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      inactiveTimeMinutes: null,
      stepPhotos: [],
    }

    try {
      const rawText = await callLLM({
        model: LLM_MODEL_FAST,
        maxTokens: 2048,
        system: 'You are a recipe extraction assistant. Extract recipe information from web page content and return ONLY valid JSON.',
        user: extractionPrompt,
      })
      // Strip markdown code fences if present
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(cleaned)
      const rawSuggested: string[] = Array.isArray(parsed.suggestedTags)
        ? parsed.suggestedTags.filter((t: unknown) => typeof t === 'string')
        : []
      const rawNewTags: RawNewTag[] = Array.isArray(parsed.suggestedNewTags)
        ? parsed.suggestedNewTags.filter(
            (t: unknown): t is RawNewTag =>
              typeof t === 'object' && t !== null &&
              typeof (t as RawNewTag).name === 'string' &&
              typeof (t as RawNewTag).section === 'string',
          )
        : []
      extracted = {
        title: typeof parsed.title === 'string' ? parsed.title : null,
        ingredients: typeof parsed.ingredients === 'string' ? parsed.ingredients : null,
        steps: typeof parsed.steps === 'string' ? parsed.steps : null,
        imageUrl: typeof parsed.imageUrl === 'string' ? parsed.imageUrl : null,
        category: typeof parsed.category === 'string' && VALID_CATEGORIES.has(parsed.category)
          ? parsed.category as 'main_dish' | 'breakfast' | 'dessert' | 'side_dish'
          : null,
        suggestedTags: rawSuggested,
        suggestedNewTags: rawNewTags,
        servings: Number.isInteger(parsed.servings) ? parsed.servings : null,
        prepTimeMinutes: Number.isInteger(parsed.prepTimeMinutes) ? parsed.prepTimeMinutes : null,
        cookTimeMinutes: Number.isInteger(parsed.cookTimeMinutes) ? parsed.cookTimeMinutes : null,
        totalTimeMinutes: Number.isInteger(parsed.totalTimeMinutes) ? parsed.totalTimeMinutes : null,
        inactiveTimeMinutes: Number.isInteger(parsed.inactiveTimeMinutes) ? parsed.inactiveTimeMinutes : null,
        stepPhotos: Array.isArray(parsed.stepPhotos)
          ? parsed.stepPhotos.filter(
              (p: unknown): p is StepPhoto =>
                typeof p === 'object' && p !== null &&
                Number.isInteger((p as StepPhoto).stepIndex) &&
                typeof (p as StepPhoto).imageUrl === 'string',
            )
          : [],
      }
    } catch (err) {
      console.error('LLM extraction error:', err)
      // Return partial: all fields null — do not throw
    }

    // Time fields missing with ingredients present is a soft partial
    const allTimeNull =
      extracted.prepTimeMinutes === null &&
      extracted.cookTimeMinutes === null &&
      extracted.totalTimeMinutes === null &&
      extracted.inactiveTimeMinutes === null
    const partial =
      extracted.title === null ||
      extracted.ingredients === null ||
      extracted.steps === null ||
      (allTimeNull && extracted.ingredients !== null)

    // Match suggestedTags against the known pool; discard unrecognised entries
    const fullPool = [...FIRST_CLASS_TAGS, ...userCustomTags]
    const VALID_SECTIONS = new Set(['style', 'dietary', 'seasonal', 'cuisine', 'protein'])

    const suggestedTags: string[] = []
    for (const tag of extracted.suggestedTags) {
      const canonical = fullPool.find((t) => t.toLowerCase() === tag.toLowerCase())
      if (canonical) suggestedTags.push(canonical)
    }

    // Pass through LLM-supplied new tags; normalise name to Title Case, validate section
    const suggestedNewTags: { name: string; section: string }[] = extracted.suggestedNewTags
      .filter((t) => VALID_SECTIONS.has(t.section))
      .map((t) => ({
        name: t.name.replace(/\b\w/g, (c) => c.toUpperCase()),
        section: t.section,
      }))

    return NextResponse.json({
      title: extracted.title,
      ingredients: extracted.ingredients,
      steps: extracted.steps,
      imageUrl: extracted.imageUrl,
      sourceUrl: rawUrl,
      partial,
      category: extracted.category,
      suggestedTags,
      suggestedNewTags,
      servings: extracted.servings,
      prepTimeMinutes: extracted.prepTimeMinutes,
      cookTimeMinutes: extracted.cookTimeMinutes,
      totalTimeMinutes: extracted.totalTimeMinutes,
      inactiveTimeMinutes: extracted.inactiveTimeMinutes,
      stepPhotos: extracted.stepPhotos,
    })
  } catch (err) {
    console.error('DB error:', err)
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
  }
})
