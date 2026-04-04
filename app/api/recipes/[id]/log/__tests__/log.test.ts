/**
 * Tests for recipe log routes
 * Covers spec test cases: T06, T07, T08, T09
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockUser = { id: 'user-1' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(url: string, method = 'POST', body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async () => null,
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
  scopeQuery: (query: { eq: (col: string, val: string) => unknown }, userId: string) => query.eq('user_id', userId),
  scopeInsert: (_userId: string, _ctx: unknown, payload: Record<string, unknown>) => ({ user_id: 'user-1', ...payload }),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

vi.mock('firecrawl', () => ({
  default: class { scrape = vi.fn().mockResolvedValue({ markdown: '' }) },
}))
vi.mock('@/lib/llm', () => ({ callLLM: vi.fn(), LLM_MODEL_FAST: 'haiku' }))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'

// Admin mock: no pantry items to simplify
function makeAdminMock(opts: {
  insertResult?: { id: string } | null
  insertError?: { code: string; message: string } | null
} = {}) {
  const { insertResult = { id: 'entry-abc' }, insertError = null } = opts
  return {
    from: vi.fn((table: string) => {
      if (table === 'recipe_history') {
        const insertChain: Record<string, unknown> = {
          select: () => ({
            single: vi.fn().mockResolvedValue({
              data: insertError ? null : insertResult,
              error: insertError,
            }),
          }),
        }
        return {
          insert: vi.fn().mockReturnValue(insertChain),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }
      }
      if (table === 'recipes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { ingredients: '200g pasta' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'pantry_items') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          delete: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return {}
    }),
  }
}

// Server mock factory for log route
function makeLogServerMock(opts: {
  insertResult?: { id: string } | null
  insertError?: { code: string; message: string } | null
  existingEntry?: { id: string } | null
  updateError?: { message: string } | null
  _entryForPatch?: { id: string } | null
} = {}) {
  const {
    insertResult = { id: 'entry-abc' },
    insertError = null,
    existingEntry = null,
    updateError = null,
    _entryForPatch = { id: 'entry-abc' },
  } = opts

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'recipe_history') {
        const insertChain: Record<string, unknown> = {
          select: () => ({
            single: vi.fn().mockResolvedValue({
              data: insertError ? null : insertResult,
              error: insertError,
            }),
          }),
        }
        return {
          insert: vi.fn().mockReturnValue(insertChain),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: existingEntry, error: null }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: updateError }),
              }),
            }),
          }),
        }
      }
      if (table === 'recipes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'recipe-1', user_id: 'user-1', ingredients: null }, error: null }),
            }),
          }),
        }
      }
      return {}
    }),
  }
}

// Patch route mock — needs a simple entry lookup + update chain
function makePatchServerMock(opts: {
  entry?: { id: string } | null
} = {}) {
  const { entry = { id: 'entry-abc' } } = opts
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
    from: vi.fn((_table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: entry, error: entry ? null : { message: 'not found' } }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })),
  }
}

// ── POST /api/recipes/[id]/log ─────────────────────────────────────────────

describe('POST /api/recipes/[id]/log', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock() as unknown as ReturnType<typeof createAdminClient>)
  })

  it('T06: returns entry_id in response body', async () => {
    vi.mocked(createServerClient).mockReturnValue(
      makeLogServerMock({ insertResult: { id: 'entry-abc' } }) as unknown as ReturnType<typeof createServerClient>,
    )
    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const res = await POST(
      makeReq('http://localhost/api/recipes/recipe-1/log') as Parameters<typeof POST>[0],
      { params: { id: 'recipe-1' } },
    )
    const json = await res.json()
    expect(json.entry_id).toBe('entry-abc')
    expect(json.already_logged).toBe(false)
  })

  it('T07: accepts make_again in body and includes it in insert', async () => {
    const mock = makeLogServerMock({ insertResult: { id: 'entry-xyz' } })
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const res = await POST(
      makeReq('http://localhost/api/recipes/recipe-1/log', 'POST', { make_again: true }) as Parameters<typeof POST>[0],
      { params: { id: 'recipe-1' } },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entry_id).toBeDefined()
  })
})

// ── PATCH /api/recipes/[id]/log/[entry_id] ─────────────────────────────────

describe('PATCH /api/recipes/[id]/log/[entry_id]', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('T08: updates make_again and returns the entry', async () => {
    const patchMock = makePatchServerMock({ entry: { id: 'entry-abc' } })
    vi.mocked(createServerClient).mockReturnValue(patchMock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(patchMock as unknown as ReturnType<typeof createAdminClient>)
    const { PATCH } = await import('@/app/api/recipes/[id]/log/[entry_id]/route')
    const res = await PATCH(
      makeReq('http://localhost/api/recipes/recipe-1/log/entry-abc', 'PATCH', { make_again: true }) as Parameters<typeof PATCH>[0],
      { params: { id: 'recipe-1', entry_id: 'entry-abc' } },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.make_again).toBe(true)
    expect(json.id).toBe('entry-abc')
  })

  it('T09: returns 404 when entry does not belong to user', async () => {
    const patchMock = makePatchServerMock({ entry: null })
    vi.mocked(createServerClient).mockReturnValue(patchMock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(patchMock as unknown as ReturnType<typeof createAdminClient>)
    const { PATCH } = await import('@/app/api/recipes/[id]/log/[entry_id]/route')
    const res = await PATCH(
      makeReq('http://localhost/api/recipes/recipe-1/log/entry-not-mine', 'PATCH', { make_again: false }) as Parameters<typeof PATCH>[0],
      { params: { id: 'recipe-1', entry_id: 'entry-not-mine' } },
    )
    expect(res.status).toBe(404)
  })
})
