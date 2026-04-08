/**
 * Tests for time fields on POST /api/recipes, PATCH /api/recipes/[id],
 * and POST /api/recipes/scrape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, defaultGetSession, makeRequest, mockHousehold } from '@/test/helpers'

const mockState = defaultMockState()

const sampleRecipe = {
  id: 'recipe-1',
  userId: 'user-1',
  householdId: null,
  title: 'Braised Short Ribs',
  category: 'main_dish',
  tags: [],
  isShared: false,
  ingredients: '2 lbs short ribs',
  steps: 'Brown the ribs\nBraise for 3 hours',
  notes: null,
  url: null,
  imageUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  prepTimeMinutes: 20,
  cookTimeMinutes: 180,
  totalTimeMinutes: 200,
  inactiveTimeMinutes: null,
  source: 'manual',
  servings: null,
}

// ── Mock chain builder ───────────────────────────────────────────────────────

function mockChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  const methods = ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin',
    'set', 'values', 'onConflictDoUpdate', 'onConflictDoNothing', 'returning', 'groupBy']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  )
  return chain
}

let selectResults: unknown[][] = [[]]
let selectCallIdx = 0

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const result = selectResults[selectCallIdx] ?? []
      selectCallIdx++
      return mockChain(result)
    }),
    insert: vi.fn(() => mockChain([sampleRecipe])),
    update: vi.fn(() => mockChain([sampleRecipe])),
    delete: vi.fn(() => mockChain([])),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock('@/lib/household', () => mockHousehold())

vi.mock('@/lib/tags-server', () => ({
  validateTags: vi.fn().mockResolvedValue({ valid: true }),
}))

vi.mock('firecrawl', () => ({
  default: class MockFirecrawl {
    scrape = vi.fn().mockResolvedValue({
      markdown: '# Short Ribs\n\n## Ingredients\n2 lbs short ribs\n\n## Instructions\nBrown the ribs\nBraise for 3 hours',
    })
  },
}))

vi.mock('@/lib/llm', () => ({
  callLLM: vi.fn(),
  LLM_MODEL_FAST: 'claude-haiku-4-5-20251001',
}))

import { callLLM } from '@/lib/llm'

async function setupAuth() {
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockImplementation(defaultGetSession(mockState))
}

async function setupInsertResult(result: unknown) {
  const { db } = await import('@/lib/db')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock chain type
  vi.mocked(db.insert).mockReturnValue(mockChain([result]) as any)
}

async function setupUpdateResult(result: unknown) {
  const { db } = await import('@/lib/db')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock chain type
  vi.mocked(db.update).mockReturnValue(mockChain([result]) as any)
}

// ── POST /api/recipes time fields ─────────────────────────────────────────────

describe('POST /api/recipes — time fields', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    selectResults = [[]]
    await setupAuth()
  })

  it('saves time fields on create', async () => {
    await setupInsertResult(sampleRecipe)

    const { POST } = await import('@/app/api/recipes/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes', {
      title: 'Braised Short Ribs',
      category: 'main_dish',
      prepTimeMinutes: 20,
      cookTimeMinutes: 180,
      totalTimeMinutes: 200,
      inactiveTimeMinutes: null,
    })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.prepTimeMinutes).toBe(20)
    expect(json.cookTimeMinutes).toBe(180)
    expect(json.totalTimeMinutes).toBe(200)
    expect(json.inactiveTimeMinutes).toBeNull()
  })

  it('saves null time fields when omitted', async () => {
    const noTimeRecipe = {
      ...sampleRecipe,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      inactiveTimeMinutes: null,
    }
    await setupInsertResult(noTimeRecipe)

    const { POST } = await import('@/app/api/recipes/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes', {
      title: 'Simple Recipe',
      category: 'main_dish',
    })
    const res = await POST(req)

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.prepTimeMinutes).toBeNull()
    expect(json.cookTimeMinutes).toBeNull()
  })
})

// ── PATCH /api/recipes/[id] time fields ───────────────────────────────────────

describe('PATCH /api/recipes/[id] — time fields', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    await setupAuth()
  })

  it('updates time fields on patch', async () => {
    const updatedRecipe = { ...sampleRecipe, prepTimeMinutes: 30, cookTimeMinutes: 60, totalTimeMinutes: 90 }
    selectResults = [[{ userId: 'user-1', householdId: null }]]
    await setupUpdateResult(updatedRecipe)

    const { PATCH } = await import('@/app/api/recipes/[id]/route')
    const req = makeRequest('PATCH', 'http://localhost/api/recipes/recipe-1', {
      prepTimeMinutes: 30,
      cookTimeMinutes: 60,
      totalTimeMinutes: 90,
    })
    const res = await PATCH(req, { params: { id: 'recipe-1' } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.prepTimeMinutes).toBe(30)
    expect(json.cookTimeMinutes).toBe(60)
    expect(json.totalTimeMinutes).toBe(90)
  })
})

// ── POST /api/recipes/scrape time fields ──────────────────────────────────────

describe('POST /api/recipes/scrape — time fields', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    selectResults = [[]]
    process.env.FIRECRAWL_API_KEY = 'test-key'
    await setupAuth()
  })

  it('returns time fields extracted from LLM response', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      title: 'Braised Short Ribs',
      ingredients: '2 lbs short ribs',
      steps: 'Brown the ribs\nBraise',
      imageUrl: null,
      suggestedTags: [],
      prepTimeMinutes: 20,
      cookTimeMinutes: 180,
      totalTimeMinutes: 200,
      inactiveTimeMinutes: null,
    }))

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/scrape', {
      url: 'https://example.com/braised-short-ribs',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.prepTimeMinutes).toBe(20)
    expect(json.cookTimeMinutes).toBe(180)
    expect(json.totalTimeMinutes).toBe(200)
    expect(json.inactiveTimeMinutes).toBeNull()
  })

  it('returns null time fields when LLM cannot extract them', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      title: 'Mystery Dish',
      ingredients: 'stuff',
      steps: 'do stuff',
      imageUrl: null,
      suggestedTags: [],
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      totalTimeMinutes: null,
      inactiveTimeMinutes: null,
    }))

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/scrape', {
      url: 'https://example.com/mystery',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.prepTimeMinutes).toBeNull()
    expect(json.cookTimeMinutes).toBeNull()
    expect(json.totalTimeMinutes).toBeNull()
    expect(json.inactiveTimeMinutes).toBeNull()
    expect(json.partial).toBe(true)
  })

  it('sets partial = false when all core fields AND time fields are present', async () => {
    vi.mocked(callLLM).mockResolvedValueOnce(JSON.stringify({
      title: 'Quick Pasta',
      ingredients: '200g pasta',
      steps: 'Cook pasta',
      imageUrl: null,
      suggestedTags: [],
      prepTimeMinutes: 5,
      cookTimeMinutes: 10,
      totalTimeMinutes: 15,
      inactiveTimeMinutes: null,
    }))

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeRequest('POST', 'http://localhost/api/recipes/scrape', {
      url: 'https://example.com/quick-pasta',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.partial).toBe(false)
  })
})
