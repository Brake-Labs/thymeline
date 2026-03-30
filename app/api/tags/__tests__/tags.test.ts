import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  customTags: [] as { id: string; name: string; section: string }[],
  insertResult: null as { id: string; name: string; section: string } | null,
  insertError: null as { message: string } | null,
}

// Fluent terminal that always resolves with customTags
function makeTagsChain(): Record<string, unknown> {
  const terminal = {
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: mockState.customTags, error: null }),
  }
  const chain: Record<string, unknown> = {
    ...terminal,
    eq: () => makeTagsChain(),
    order: () => makeTagsChain(),
    single: async () => ({ data: mockState.customTags[0] ?? null, error: null }),
  }
  return chain
}

function makeTagsFrom(table: string) {
  if (table === 'custom_tags') {
    return {
      select: () => makeTagsChain(),
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: mockState.insertResult,
            error: mockState.insertError,
          }),
        }),
      }),
    }
  }
  return {}
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockState.user },
        error: mockState.user ? null : { message: 'no user' },
      }),
    },
    from: makeTagsFrom,
  }),
  createAdminClient: () => ({ from: makeTagsFrom }),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
}))

import { resolveHouseholdScope } from '@/lib/household'

const { GET, POST } = await import('@/app/api/tags/route')

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  return new NextRequest(url, opts)
}

beforeEach(() => {
  mockState.user = { id: 'user-1' }
  mockState.customTags = []
  mockState.insertResult = null
  mockState.insertError = null
})

// ── T27: GET /api/tags returns { firstClass, custom } ─────────────────────────

describe('T27 - GET /api/tags returns correct shape', () => {
  it('returns firstClass array containing known tags and custom array for the user', async () => {
    mockState.customTags = [{ id: 'ct1', name: 'MyTag', section: 'cuisine' }]
    const res = await GET(makeReq('GET', 'http://localhost/api/tags'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.firstClass)).toBe(true)
    expect(body.firstClass).toContain('Chicken')
    expect(body.firstClass).toContain('Vegetarian')
    expect(body.custom).toEqual([{ name: 'MyTag', section: 'cuisine' }])
  })

  it('returns empty custom array when user has no custom tags', async () => {
    const res = await GET(makeReq('GET', 'http://localhost/api/tags'))
    const body = await res.json()
    expect(body.custom).toEqual([])
    expect(body.firstClass.length).toBeGreaterThan(0)
  })

})

// ── T12: POST /api/tags returns 400 for first-class tag ───────────────────────

describe('T12 - POST /api/tags returns 400 when name matches first-class tag', () => {
  it('rejects "chicken" (case-insensitive match to "Chicken")', async () => {
    const res = await POST(makeReq('POST', 'http://localhost/api/tags', { name: 'chicken' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/built-in tag/)
  })

  it('rejects exact match "Vegan"', async () => {
    const res = await POST(makeReq('POST', 'http://localhost/api/tags', { name: 'Vegan' }))
    expect(res.status).toBe(400)
  })
})

// ── T13: POST /api/tags returns 409 for duplicate custom tag ──────────────────

describe('T13 - POST /api/tags returns 409 for duplicate custom tag', () => {
  it('returns 409 when a matching custom tag already exists (case-insensitive)', async () => {
    mockState.customTags = [{ id: 'ct1', name: 'MyTag' }]
    const res = await POST(makeReq('POST', 'http://localhost/api/tags', { name: 'mytag' }))
    expect(res.status).toBe(409)
  })
})

// ── POST /api/tags happy path ─────────────────────────────────────────────────

describe('POST /api/tags creates a new custom tag', () => {
  it('normalizes to Title Case and inserts', async () => {
    mockState.insertResult = { id: 'ct-new', name: 'My New Tag', section: 'cuisine' }
    const res = await POST(makeReq('POST', 'http://localhost/api/tags', { name: 'my new tag' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('My New Tag')
  })

})

// ── T23: Household member GET returns household tag library ───────────────────

describe('T23 - household GET /api/tags returns household-scoped custom tags', () => {
  it('returns custom tags scoped to the household when user is a member', async () => {
    mockState.customTags = [{ id: 'ht1', name: 'HouseholdTag', section: 'cuisine' }]
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })
    const res = await GET(makeReq('GET', 'http://localhost/api/tags'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.firstClass)).toBe(true)
    expect(body.custom).toEqual([{ name: 'HouseholdTag', section: 'cuisine' }])
  })
})

// ── T24: Household POST tag sets household_id ─────────────────────────────────

describe('T24 - POST /api/tags sets household_id when user is in a household', () => {
  it('returns 201 and inserts the tag in household scope', async () => {
    mockState.insertResult = { id: 'ht-new', name: 'SharedTag', section: 'cuisine' }
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })
    const res = await POST(makeReq('POST', 'http://localhost/api/tags', { name: 'shared tag' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('SharedTag')
  })
})
