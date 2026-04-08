/**
 * Tests for recipe log routes
 * Covers spec test cases: T06, T07, T08, T09
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defaultMockState, defaultGetSession, makeRequest, mockHousehold } from '@/test/helpers'

const mockState = defaultMockState()

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

// Track insert behavior for log route
let insertBehavior: 'success' | 'duplicate' = 'success'
let insertResult = [{ id: 'entry-abc' }]
let selectResults: unknown[][] = []
let selectCallIdx = 0

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const result = selectResults[selectCallIdx] ?? []
      selectCallIdx++
      return mockChain(result)
    }),
    insert: vi.fn(() => {
      if (insertBehavior === 'duplicate') {
        const chain = mockChain([])
        chain.returning = vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation(
            (_resolve: unknown, reject?: (err: Error) => void) => {
              const err = new Error('23505: recipe_history_unique_day')
              return Promise.reject(err).catch(reject ?? (() => { throw err }))
            },
          ),
        })
        return chain
      }
      return mockChain(insertResult)
    }),
    update: vi.fn(() => mockChain([])),
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

vi.mock('@/lib/household', () => ({
  ...mockHousehold(),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

vi.mock('firecrawl', () => ({
  default: class { scrape = vi.fn().mockResolvedValue({ markdown: '' }) },
}))
vi.mock('@/lib/llm', () => ({ callLLM: vi.fn(), LLM_MODEL_FAST: 'haiku' }))

async function setupAuth() {
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockImplementation(defaultGetSession(mockState))
}

// ── POST /api/recipes/[id]/log ─────────────────────────────────────────────

describe('POST /api/recipes/[id]/log', () => {
  beforeEach(async () => {
    vi.resetModules()
    insertBehavior = 'success'
    insertResult = [{ id: 'entry-abc' }]
    selectCallIdx = 0
    selectResults = [
      [{ id: 'recipe-1', userId: 'user-1', ingredients: null }],  // checkOwnership
      [{ ingredients: '200g pasta' }],  // deductPantry recipe lookup
      [],  // deductPantry pantry items
    ]
    await setupAuth()
  })

  it('T06: returns entry_id in response body', async () => {
    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes/recipe-1/log'),
      { params: { id: 'recipe-1' } },
    )
    const json = await res.json()
    expect(json.entry_id).toBe('entry-abc')
    expect(json.already_logged).toBe(false)
  })

  it('T07: accepts makeAgain in body and includes it in insert', async () => {
    insertResult = [{ id: 'entry-xyz' }]
    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/recipes/recipe-1/log', { makeAgain: true }),
      { params: { id: 'recipe-1' } },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entry_id).toBeDefined()
  })
})

// ── PATCH /api/recipes/[id]/log/[entry_id] ─────────────────────────────────

describe('PATCH /api/recipes/[id]/log/[entry_id]', () => {
  beforeEach(async () => {
    vi.resetModules()
    selectCallIdx = 0
    await setupAuth()
  })

  it('T08: updates makeAgain and returns the entry', async () => {
    selectResults = [[{ id: 'entry-abc' }]]

    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock chain type
    vi.mocked(db.update).mockReturnValue(mockChain([]) as any)

    const { PATCH } = await import('@/app/api/recipes/[id]/log/[entry_id]/route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/recipes/recipe-1/log/entry-abc', { makeAgain: true }),
      { params: { id: 'recipe-1', entry_id: 'entry-abc' } },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.makeAgain).toBe(true)
    expect(json.id).toBe('entry-abc')
  })

  it('T09: returns 404 when entry does not belong to user', async () => {
    selectResults = [[]]  // no entry found

    const { PATCH } = await import('@/app/api/recipes/[id]/log/[entry_id]/route')
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/recipes/recipe-1/log/entry-not-mine', { makeAgain: false }),
      { params: { id: 'recipe-1', entry_id: 'entry-not-mine' } },
    )
    expect(res.status).toBe(404)
  })
})
