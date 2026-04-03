import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockSupabase,
  mockHousehold,
  makeRequest,
  defaultGetUser,
} from '@/test/helpers'

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  customTags: [] as { id: string; name: string; section: string }[],
  insertResult: null as { id: string; name: string; section: string } | null,
  insertError: null as { message: string } | null,
  recipes: [] as { tags: string[] }[],
  hiddenTags: [] as string[],
}

// ── Fluent chain helpers ──────────────────────────────────────────────────────

function makeTagsChain(): Record<string, unknown> {
  const terminal = {
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: mockState.customTags, error: null }),
  }
  return {
    ...terminal,
    eq: () => makeTagsChain(),
    order: () => makeTagsChain(),
    single: async () => ({ data: mockState.customTags[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: mockState.customTags[0] ?? null, error: null }),
  }
}

function makeRecipesChain(): Record<string, unknown> {
  const terminal = {
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: mockState.recipes, error: null }),
  }
  return { ...terminal, eq: () => makeRecipesChain() }
}

function makePrefsChain(): Record<string, unknown> {
  return {
    eq: () => makePrefsChain(),
    maybeSingle: async () => ({
      data: mockState.hiddenTags.length > 0 ? { hidden_tags: mockState.hiddenTags } : null,
      error: null,
    }),
    upsert: async () => ({ data: null, error: null }),
  }
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
  if (table === 'recipes') {
    return { select: () => makeRecipesChain() }
  }
  if (table === 'user_preferences') {
    return {
      select: () => makePrefsChain(),
      upsert: async () => ({ data: null, error: null }),
    }
  }
  return {}
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () =>
  mockSupabase(makeTagsFrom, defaultGetUser(mockState))
)

vi.mock('@/lib/household', () => mockHousehold({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
}))

import { resolveHouseholdScope } from '@/lib/household'

const { GET, POST } = await import('@/app/api/tags/route')

beforeEach(() => {
  mockState.user = { id: 'user-1' }
  mockState.customTags = []
  mockState.insertResult = null
  mockState.insertError = null
  mockState.recipes = []
  mockState.hiddenTags = []
})

// ── T27: GET /api/tags returns new shape with recipe_count ────────────────────

describe('T27 - GET /api/tags returns correct shape with counts', () => {
  it('returns firstClass as objects with name + recipe_count', async () => {
    mockState.customTags = [{ id: 'ct1', name: 'MyTag', section: 'cuisine' }]
    mockState.recipes = [{ tags: ['Chicken', 'Chicken', 'MyTag'] }]
    const res = await GET(makeRequest('GET', 'http://localhost/api/tags'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.firstClass)).toBe(true)
    // firstClass entries are objects now
    const chicken = body.firstClass.find((t: { name: string }) => t.name === 'Chicken')
    expect(chicken).toBeDefined()
    expect(chicken.recipe_count).toBe(2)
    // custom has recipe_count too
    expect(body.custom).toEqual([{ name: 'MyTag', section: 'cuisine', recipe_count: 1 }])
  })

  it('returns empty custom and zero counts when no recipes', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tags'))
    const body = await res.json()
    expect(body.custom).toEqual([])
    expect(body.firstClass.length).toBeGreaterThan(0)
    expect(body.firstClass[0].recipe_count).toBe(0)
  })

  it('returns hidden array (empty by default)', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tags'))
    const body = await res.json()
    expect(Array.isArray(body.hidden)).toBe(true)
    expect(body.hidden).toEqual([])
  })
})

// ── Spec-19 T1: Tag library loads with recipe counts ─────────────────────────

describe('Spec-19 T1 - recipe counts appear in GET response', () => {
  it('counts tags correctly across multiple recipes', async () => {
    mockState.recipes = [
      { tags: ['Quick', 'Vegan'] },
      { tags: ['Quick'] },
      { tags: ['Vegan', 'Gluten-Free'] },
    ]
    const res = await GET(makeRequest('GET', 'http://localhost/api/tags'))
    const body = await res.json()
    const quick = body.firstClass.find((t: { name: string }) => t.name === 'Quick')
    const vegan = body.firstClass.find((t: { name: string }) => t.name === 'Vegan')
    expect(quick?.recipe_count).toBe(2)
    expect(vegan?.recipe_count).toBe(2)
  })
})

// ── Spec-19 T2: Hidden tags appear in hidden section, not firstClass ──────────

describe('Spec-19 T2 - hidden tags excluded from firstClass, present in hidden', () => {
  it('moves hidden first-class tag to hidden array', async () => {
    mockState.hiddenTags = ['Keto']
    const res = await GET(makeRequest('GET', 'http://localhost/api/tags'))
    const body = await res.json()
    const firstClassNames = body.firstClass.map((t: { name: string }) => t.name)
    expect(firstClassNames).not.toContain('Keto')
    expect(body.hidden).toEqual([{ name: 'Keto' }])
  })

  it('hidden array preserves canonical casing from FIRST_CLASS_TAGS', async () => {
    mockState.hiddenTags = ['gluten-free']  // lowercase in storage
    const res = await GET(makeRequest('GET', 'http://localhost/api/tags'))
    const body = await res.json()
    // Should return canonical "Gluten-Free"
    expect(body.hidden[0]?.name).toBe('Gluten-Free')
  })
})

// ── T12: POST returns 400 for first-class tag ─────────────────────────────────

describe('T12 - POST /api/tags returns 400 when name matches first-class tag', () => {
  it('rejects "chicken" (case-insensitive)', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tags', { name: 'chicken' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/built-in tag/)
  })

  it('rejects exact match "Vegan"', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tags', { name: 'Vegan' }))
    expect(res.status).toBe(400)
  })
})

// ── T13: POST returns 409 for duplicate custom tag ────────────────────────────

describe('T13 - POST /api/tags returns 409 for duplicate custom tag', () => {
  it('returns 409 when a matching custom tag already exists (case-insensitive)', async () => {
    mockState.customTags = [{ id: 'ct1', name: 'MyTag', section: 'cuisine' }]
    const res = await POST(makeRequest('POST', 'http://localhost/api/tags', { name: 'mytag' }))
    expect(res.status).toBe(409)
  })
})

// ── POST happy path ───────────────────────────────────────────────────────────

describe('POST /api/tags creates a new custom tag', () => {
  it('normalizes to Title Case and returns 201', async () => {
    mockState.insertResult = { id: 'ct-new', name: 'My New Tag', section: 'cuisine' }
    const res = await POST(makeRequest('POST', 'http://localhost/api/tags', { name: 'my new tag' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('My New Tag')
  })
})

// ── T23: Household GET returns household-scoped tags ─────────────────────────

describe('T23 - household GET /api/tags returns household-scoped custom tags', () => {
  it('returns custom tags scoped to the household', async () => {
    mockState.customTags = [{ id: 'ht1', name: 'HouseholdTag', section: 'cuisine' }]
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({ householdId: 'hh-1', role: 'member' })
    const res = await GET(makeRequest('GET', 'http://localhost/api/tags'))
    const body = await res.json()
    expect(body.custom[0]?.name).toBe('HouseholdTag')
  })
})

// ── T24: POST tag in household scope ─────────────────────────────────────────

describe('T24 - POST /api/tags sets household_id when user is in a household', () => {
  it('returns 201 for household member', async () => {
    mockState.insertResult = { id: 'ht-new', name: 'SharedTag', section: 'cuisine' }
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({ householdId: 'hh-1', role: 'member' })
    const res = await POST(makeRequest('POST', 'http://localhost/api/tags', { name: 'shared tag' }))
    expect(res.status).toBe(201)
  })
})
