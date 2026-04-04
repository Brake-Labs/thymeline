/**
 * Tests for POST /api/cook/order — multi-recipe step interleaving
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock state ────────────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  // LLM returns this array of step IDs (or null to simulate failure)
  llmOrderedIds: null as string[] | null,
  llmShouldThrow: false,
}

// ── Auth mock ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) =>
    async (req: NextRequest, ...args: unknown[]) => {
      if (!mockState.user) {
        const { NextResponse } = await import('next/server')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const db = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: null }) }) }) }
      return handler(req, { user: mockState.user, db, ctx: null }, ...args)
    },
}))

// ── LLM mock ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/llm', () => ({
  callLLM: vi.fn(async () => {
    if (mockState.llmShouldThrow) throw new Error('LLM error')
    return JSON.stringify(mockState.llmOrderedIds ?? [])
  }),
  parseLLMJson: (text: string) => JSON.parse(text),
  LLM_MODEL_CAPABLE: 'claude-test',
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function POST(body: unknown) {
  const { POST: handler } = await import('../order/route')
  const req = new NextRequest('http://localhost/api/cook/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return handler(req)
}

const recipeA = { id: 'r-a', title: 'Pasta', steps: ['Boil water', 'Cook pasta', 'Drain and serve'] }
const recipeB = { id: 'r-b', title: 'Salad', steps: ['Chop vegetables', 'Toss with dressing'] }

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockState.user = { id: 'user-1' }
  mockState.llmOrderedIds = null
  mockState.llmShouldThrow = false
  vi.resetModules()
})

describe('T01 — single recipe returns steps in order, no LLM call', () => {
  it('returns sequential steps without calling LLM', async () => {
    const { callLLM } = await import('@/lib/llm')
    const res = await POST({ recipes: [recipeA] })
    expect(res.status).toBe(200)
    const data = await res.json() as { ordered: { recipeId: string; stepIndex: number }[] }
    expect(data.ordered).toEqual([
      { recipeId: 'r-a', stepIndex: 0 },
      { recipeId: 'r-a', stepIndex: 1 },
      { recipeId: 'r-a', stepIndex: 2 },
    ])
    expect(callLLM).not.toHaveBeenCalled()
  })
})

describe('T02 — LLM-ordered interleaving returned correctly', () => {
  it('returns steps in the LLM-specified order', async () => {
    mockState.llmOrderedIds = ['r-a:0', 'r-b:0', 'r-a:1', 'r-b:1', 'r-a:2']
    const res = await POST({ recipes: [recipeA, recipeB] })
    expect(res.status).toBe(200)
    const data = await res.json() as { ordered: { recipeId: string; stepIndex: number }[] }
    expect(data.ordered).toEqual([
      { recipeId: 'r-a', stepIndex: 0 },
      { recipeId: 'r-b', stepIndex: 0 },
      { recipeId: 'r-a', stepIndex: 1 },
      { recipeId: 'r-b', stepIndex: 1 },
      { recipeId: 'r-a', stepIndex: 2 },
    ])
  })
})

describe('T03 — LLM failure falls back to sequential longest-first order', () => {
  it('falls back gracefully when LLM throws', async () => {
    mockState.llmShouldThrow = true
    const res = await POST({ recipes: [recipeB, recipeA] })  // B has 2 steps, A has 3 — A goes first
    expect(res.status).toBe(200)
    const data = await res.json() as { ordered: { recipeId: string; stepIndex: number }[] }
    // Fallback sorts by step count descending: A (3 steps) before B (2 steps)
    expect(data.ordered.map((s) => s.recipeId)).toEqual(['r-a', 'r-a', 'r-a', 'r-b', 'r-b'])
  })
})

describe('T04 — LLM drops a step — missing step appended at end', () => {
  it('appends dropped steps so all steps are present', async () => {
    // LLM forgot r-a:2
    mockState.llmOrderedIds = ['r-a:0', 'r-b:0', 'r-a:1', 'r-b:1']
    const res = await POST({ recipes: [recipeA, recipeB] })
    expect(res.status).toBe(200)
    const data = await res.json() as { ordered: { recipeId: string; stepIndex: number }[] }
    expect(data.ordered).toHaveLength(5)
    expect(data.ordered[4]).toEqual({ recipeId: 'r-a', stepIndex: 2 })
  })
})

describe('T05 — LLM returns duplicate ID — deduplicated', () => {
  it('removes duplicate step IDs from LLM output', async () => {
    mockState.llmOrderedIds = ['r-a:0', 'r-a:0', 'r-b:0', 'r-a:1', 'r-b:1', 'r-a:2']
    const res = await POST({ recipes: [recipeA, recipeB] })
    expect(res.status).toBe(200)
    const data = await res.json() as { ordered: { recipeId: string; stepIndex: number }[] }
    expect(data.ordered).toHaveLength(5)
  })
})

describe('T06 — invalid request body', () => {
  it('returns 400 for missing recipes', async () => {
    const res = await POST({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty recipes array', async () => {
    const res = await POST({ recipes: [] })
    expect(res.status).toBe(400)
  })
})

describe('T07 — LLM includes invalid step IDs — filtered out', () => {
  it('ignores step IDs that do not exist in the input recipes', async () => {
    // LLM hallucinated 'r-c:0'
    mockState.llmOrderedIds = ['r-a:0', 'r-c:0', 'r-b:0', 'r-a:1', 'r-b:1', 'r-a:2']
    const res = await POST({ recipes: [recipeA, recipeB] })
    expect(res.status).toBe(200)
    const data = await res.json() as { ordered: { recipeId: string; stepIndex: number }[] }
    expect(data.ordered).toHaveLength(5)
    expect(data.ordered.every((s) => s.recipeId === 'r-a' || s.recipeId === 'r-b')).toBe(true)
  })
})
