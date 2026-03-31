import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { scanPantrySchema, parseBody } from '@/lib/schemas'
import { callLLMMultimodal, classifyLLMError, parseLLMJson, LLM_MODEL_CAPABLE } from '@/lib/llm'

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

export const POST = withAuth(async (req) => {
  const { data: body, error: parseError } = await parseBody(req, scanPantrySchema)
  if (parseError) return NextResponse.json({ detected: [] })

  // Extract media type and base64 data from data URL, or fall back to jpeg
  const dataUrlMatch = body.image.match(/^data:(image\/[a-z+]+);base64,(.+)$/i)
  const mediaType = (dataUrlMatch?.[1] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  const base64Data = dataUrlMatch?.[2] ?? body.image

  try {
    const rawText = await callLLMMultimodal({
      model: LLM_MODEL_CAPABLE,
      maxTokens: 1024,
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

    const parsed = parseLLMJson<{ detected: { name: string; quantity: string | null; section: string | null }[] }>(rawText)

    if (!Array.isArray(parsed.detected)) {
      return NextResponse.json({ detected: [] })
    }

    return NextResponse.json({ detected: parsed.detected })
  } catch (err) {
    const llmErr = classifyLLMError(err)
    console.error('[pantry/scan] LLM error:', llmErr.code, llmErr.message)
    return NextResponse.json({ detected: [], error: 'Scan service unavailable' })
  }
})
