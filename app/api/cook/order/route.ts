import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { callLLM, parseLLMJson, LLM_MODEL_CAPABLE } from '@/lib/llm'

interface RecipeInput {
  id: string
  title: string
  steps: string[]
}

export interface StepRef {
  recipeId: string
  stepIndex: number
}

/** POST /api/cook/order
 *
 * Body: { recipes: RecipeInput[] }
 * Returns: { ordered: StepRef[] } — all steps from all recipes in the optimal
 * interleaved sequence for parallel cooking efficiency.
 */
export const POST = withAuth(async (req: NextRequest) => {
  let body: { recipes?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (
    !Array.isArray(body.recipes) ||
    body.recipes.length === 0 ||
    !body.recipes.every(
      (r): r is RecipeInput =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as RecipeInput).id === 'string' &&
        typeof (r as RecipeInput).title === 'string' &&
        Array.isArray((r as RecipeInput).steps),
    )
  ) {
    return NextResponse.json({ error: 'recipes array required' }, { status: 400 })
  }

  const recipes = body.recipes as RecipeInput[]

  // Single recipe — return as-is, no LLM needed
  if (recipes.length === 1) {
    const r = recipes[0]!
    return NextResponse.json({
      ordered: r.steps.map((_, i): StepRef => ({ recipeId: r.id, stepIndex: i })),
    })
  }

  // Build a compact numbered list for the LLM
  const numberedSteps = recipes.flatMap((r) =>
    r.steps.map((text, i) => `[${r.id}:${i}] ${r.title} — ${text}`),
  )
  const allIds = recipes.flatMap((r) => r.steps.map((_, i) => `${r.id}:${i}`))

  const prompt = `You are helping a home cook prepare ${recipes.length} recipes simultaneously. Reorder the steps below into the most time-efficient sequence.

Guidelines:
- All steps must appear exactly once
- Steps within the same recipe that depend on each other must stay in their original relative order (e.g. step 2 cannot come before step 1 of the same recipe)
- When a step involves passive waiting (simmering, boiling, baking, roasting, resting, chilling, marinating, rising), use that gap for active steps from other recipes
- Steps requiring active attention should not overlap with other active steps
- Aim to minimise total elapsed time

Steps (format: [recipeId:stepIndex] title — text):
${numberedSteps.join('\n')}

Return ONLY a JSON array of step IDs in the optimal order, e.g.:
["${allIds[0]}", "${allIds[1] ?? allIds[0]}"]`

  let orderedIds: string[]
  try {
    const raw = await callLLM({
      model: LLM_MODEL_CAPABLE,
      maxTokens: 1024,
      system: 'You are a cooking assistant that creates optimally ordered step-by-step instructions.',
      user: prompt,
    })
    const parsed = parseLLMJson<string[]>(raw)
    if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === 'string')) {
      throw new Error('unexpected LLM response shape')
    }
    orderedIds = parsed
  } catch (err) {
    console.error('[cook/order] LLM failed, using fallback order:', err)
    // Fallback: sequential, longest-cooking recipe first
    const sorted = [...recipes].sort((a, b) => b.steps.length - a.steps.length)
    orderedIds = sorted.flatMap((r) => r.steps.map((_, i) => `${r.id}:${i}`))
  }

  // Validate: remove dupes, filter unknowns, append any missed steps
  const validSet = new Set(allIds)
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const id of orderedIds) {
    if (validSet.has(id) && !seen.has(id)) {
      deduped.push(id)
      seen.add(id)
    }
  }
  // Append any steps the LLM dropped
  for (const id of allIds) {
    if (!seen.has(id)) deduped.push(id)
  }

  const ordered: StepRef[] = deduped.map((id) => {
    const colonIdx = id.lastIndexOf(':')
    return {
      recipeId: id.slice(0, colonIdx),
      stepIndex: parseInt(id.slice(colonIdx + 1), 10),
    }
  })

  return NextResponse.json({ ordered })
})
