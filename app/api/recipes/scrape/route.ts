import { NextRequest, NextResponse } from 'next/server'
import FirecrawlApp from 'firecrawl'
import { createServerClient } from '@/lib/supabase-server'
import { anthropic } from '@/lib/llm'

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  if (!firecrawlKey) {
    console.error('FIRECRAWL_API_KEY is not set')
    return NextResponse.json({ error: 'Scraping service not configured' }, { status: 500 })
  }

  let body: { url?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rawUrl = body.url
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  // Validate URL
  try {
    new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: 'url must be a valid URL' }, { status: 400 })
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

  // Extract recipe data via LLM
  const extractionPrompt = `You are a recipe extraction assistant. Extract recipe information from the following web page content and return ONLY a JSON object with no markdown formatting.

The JSON must have exactly these fields:
- "title": string or null (the recipe name)
- "ingredients": string or null (all ingredients, one per line, newline-separated)
- "steps": string or null (cooking steps, one per line, plain text without numbering — numbering is a display concern)
- "imageUrl": string or null (URL of the main recipe image if present)

If a field cannot be found, set it to null. Do not invent data.

Note: cooking steps may appear after a long ingredients list or narrative content. Look for sections labeled "Instructions", "Directions", "Method", or "Steps".

Page content:
${pageContent.slice(0, 20000)}`

  let extracted: {
    title: string | null
    ingredients: string | null
    steps: string | null
    imageUrl: string | null
  } = { title: null, ingredients: null, steps: null, imageUrl: null }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      temperature: 0,
      messages: [{ role: 'user', content: extractionPrompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    extracted = {
      title: typeof parsed.title === 'string' ? parsed.title : null,
      ingredients: typeof parsed.ingredients === 'string' ? parsed.ingredients : null,
      steps: typeof parsed.steps === 'string' ? parsed.steps : null,
      imageUrl: typeof parsed.imageUrl === 'string' ? parsed.imageUrl : null,
    }
  } catch (err) {
    console.error('LLM extraction error:', err)
    // Return partial: all fields null — do not throw
  }

  const partial =
    extracted.title === null ||
    extracted.ingredients === null ||
    extracted.steps === null

  return NextResponse.json({
    title: extracted.title,
    ingredients: extracted.ingredients,
    steps: extracted.steps,
    imageUrl: extracted.imageUrl,
    sourceUrl: rawUrl,
    partial,
  })
}
