import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.LLM_API_KEY })

const SYSTEM_PROMPT = `You are a pantry scanner. Analyze the provided image and identify all visible food ingredients, condiments, and packaged goods.

For each item:
- Identify the ingredient name
- Estimate quantity where confident (e.g. "1 dozen", "half a bag"), or leave quantity null
- Infer section using: Produce, Proteins, Dairy & Eggs, Pantry, Canned & Jarred, Bakery, Frozen, Other

Return ONLY valid JSON — no prose, no markdown:
{
  "detected": [
    { "name": "string", "quantity": "string or null", "section": "string or null" }
  ]
}`

// ── POST /api/pantry/scan ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { image?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ detected: [] })
  }

  if (!body.image || typeof body.image !== 'string') {
    return NextResponse.json({ detected: [] })
  }

  // Extract media type and base64 data from data URL, or fall back to jpeg
  const dataUrlMatch = body.image.match(/^data:(image\/[a-z+]+);base64,(.+)$/i)
  const mediaType = (dataUrlMatch?.[1] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  const base64Data = dataUrlMatch ? dataUrlMatch[2] : body.image

  try {
    const response = await anthropic.messages.create({
      model: process.env.LLM_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: 'Identify all food items visible in this image.',
            },
          ],
        },
      ],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as { detected: { name: string; quantity: string | null; section: string | null }[] }

    if (!Array.isArray(parsed.detected)) {
      return NextResponse.json({ detected: [] })
    }

    return NextResponse.json({ detected: parsed.detected })
  } catch {
    return NextResponse.json({ detected: [] })
  }
}
