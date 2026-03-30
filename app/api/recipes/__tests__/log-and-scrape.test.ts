/**
 * Tests for the log and scrape routes.
 * Covers spec test cases: T01, T02, T06, T07
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockUser = { id: 'user-1' }

const sampleRecipe = {
  id: 'recipe-1',
  user_id: 'user-1',
  title: 'Pasta',
  category: 'main_dish',
  tags: [],
  is_shared: false,
  ingredients: '200g pasta',
  steps: 'Cook pasta',
  notes: null,
  url: null,
  image_url: null,
  created_at: '2026-01-01T00:00:00Z',
}

function makeSupabaseMock(opts: {
  insertError?: { code: string; message: string } | null
  singleResult?: unknown
  singleError?: { message: string } | null
  customTags?: { name: string }[]
} = {}) {
  const { insertError = null, singleResult = sampleRecipe, singleError = null, customTags = [] } = opts

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: singleResult, error: singleError }),
            }),
          }),
        }
      }
      if (table === 'recipe_history') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: insertError }),
        }
      }
      if (table === 'custom_tags') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: customTags, error: null }),
          }),
        }
      }
      return {}
    }),
  }
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async () => null,
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
}))

// Firecrawl class mock (must mock before importing route)
vi.mock('firecrawl', () => ({
  default: class MockFirecrawl {
    scrape = vi.fn().mockResolvedValue({
      markdown: '# Pasta Carbonara\n\n## Ingredients\n200g pasta\n\n## Steps\nCook pasta',
    })
  },
}))

vi.mock('@/lib/llm', () => ({
  anthropic: {
    messages: {
      create: vi.fn(),
    },
  },
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { anthropic } from '@/lib/llm'

// Admin DB mock for pantry deduction tests
function makeAdminMock(opts: {
  pantryItems?: { id: string; name: string; quantity: string | null; user_id: string }[]
  recipeIngredients?: string
  insertError?: { code: string; message: string } | null
  singleResult?: unknown
  customTags?: { name: string }[]
} = {}) {
  const { pantryItems = [], recipeIngredients = '200g pasta', insertError = null, singleResult, customTags = [] } = opts
  const deletedIds: string[] = []

  const mock = {
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: singleResult ?? { ingredients: recipeIngredients },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'recipe_history') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: insertError }),
        }
      }
      if (table === 'custom_tags') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: customTags, error: null }),
          }),
        }
      }
      if (table === 'pantry_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: pantryItems, error: null }),
          }),
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockImplementation((_col: string, ids: string[]) => {
              deletedIds.push(...ids)
              return Promise.resolve({ data: null, error: null })
            }),
          }),
        }
      }
      return {}
    }),
    _deletedIds: deletedIds,
  }
  return mock
}

function makeReq(url: string, method = 'POST', body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── Log tests ─────────────────────────────────────────────────────────────────

describe('POST /api/recipes/[id]/log', () => {
  beforeEach(() => {
    vi.resetModules()
    // Default admin mock — pantry deduction is silent, so any admin mock works for non-deduction tests
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock() as unknown as ReturnType<typeof createAdminClient>)
  })

  it('T06: logs a new cook entry and returns already_logged = false', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)

    // Import using @/ alias to avoid bracket path issues
    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeReq(`http://localhost/api/recipes/${sampleRecipe.id}/log`)
    const res = await POST(req as Parameters<typeof POST>[0], { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.already_logged).toBe(false)
    expect(json.made_on).toBeDefined()
  })

  it('T07: duplicate log returns already_logged = true and no 500', async () => {
    const uniqueViolation = { code: '23505', message: 'recipe_history_unique_day' }
    const mock = makeSupabaseMock({ insertError: uniqueViolation })
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock({ insertError: uniqueViolation }) as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeReq(`http://localhost/api/recipes/${sampleRecipe.id}/log`)
    const res = await POST(req as Parameters<typeof POST>[0], { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.already_logged).toBe(true)
  })

  it('logs a specific date when made_on is provided in body', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeReq(
      `http://localhost/api/recipes/${sampleRecipe.id}/log`,
      'POST',
      { made_on: '2025-12-25' },
    )
    const res = await POST(req as Parameters<typeof POST>[0], { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.made_on).toBe('2025-12-25')
    expect(json.already_logged).toBe(false)
  })

  it('defaults to today when made_on body is absent', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeReq(`http://localhost/api/recipes/${sampleRecipe.id}/log`)
    const res = await POST(req as Parameters<typeof POST>[0], { params: { id: sampleRecipe.id } })

    const json = await res.json()
    const today = new Date().toISOString().split('T')[0]
    expect(json.made_on).toBe(today)
  })

  it('ignores invalid made_on format and defaults to today', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeReq(
      `http://localhost/api/recipes/${sampleRecipe.id}/log`,
      'POST',
      { made_on: 'not-a-date' },
    )
    const res = await POST(req as Parameters<typeof POST>[0], { params: { id: sampleRecipe.id } })

    const json = await res.json()
    const today = new Date().toISOString().split('T')[0]
    expect(json.made_on).toBe(today)
  })
})

// ── Scrape tests ──────────────────────────────────────────────────────────────

describe('POST /api/recipes/scrape', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.FIRECRAWL_API_KEY = 'test-key'
  })

  it('T01: successful scrape pre-fills title, ingredients, and steps (partial = false)', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock() as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Pasta Carbonara',
        ingredients: '200g pasta\n100g pancetta',
        steps: 'Cook pasta\nFry pancetta\nCombine',
        imageUrl: 'https://example.com/pasta.jpg',
        suggestedTags: [],
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
        totalTimeMinutes: 30,
        inactiveTimeMinutes: null,
      }) }],
    } as unknown as Awaited<ReturnType<typeof anthropic.messages.create>>)

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeReq('http://localhost/api/recipes/scrape', 'POST', {
      url: 'https://example.com/pasta-carbonara',
    })
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.title).toBe('Pasta Carbonara')
    expect(json.ingredients).toContain('pasta')
    expect(json.steps).toContain('Cook')
    expect(json.partial).toBe(false)
    expect(json.sourceUrl).toBe('https://example.com/pasta-carbonara')
  })

  it('T02: partial scrape (steps null) sets partial = true, save button not blocked', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock() as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Pasta Carbonara',
        ingredients: '200g pasta',
        steps: null,
        imageUrl: null,
      }) }],
    } as unknown as Awaited<ReturnType<typeof anthropic.messages.create>>)

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeReq('http://localhost/api/recipes/scrape', 'POST', {
      url: 'https://example.com/partial-recipe',
    })
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.title).toBe('Pasta Carbonara')
    expect(json.steps).toBeNull()
    expect(json.partial).toBe(true)
    // Route always returns 200 — never blocks the client from saving
  })

  it('returns 400 for missing URL', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock() as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeReq('http://localhost/api/recipes/scrape', 'POST', {})
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid URL', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock() as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeReq('http://localhost/api/recipes/scrape', 'POST', { url: 'not-a-url' })
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(400)
  })

  // ── Spec-06 T01: suggestedTags / suggestedNewTags ───────────────────────────

  it('T01 (spec-06): returns suggestedTags (canonical casing) and suggestedNewTags ({name,section})', async () => {
    // 'chicken' → matches first-class 'Chicken' → goes to suggestedTags
    // 'my-custom-sauce' → matches user custom tag 'My-Custom-Sauce' → goes to suggestedTags
    // 'weird-technique' → not in suggestedTags → silently dropped
    // LLM-supplied suggestedNewTags with section → passed through (Title Case normalised)
    const mock = makeSupabaseMock({
      customTags: [{ name: 'My-Custom-Sauce' }],
    })
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock({ customTags: [{ name: 'My-Custom-Sauce' }] }) as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Pasta',
        ingredients: '200g pasta',
        steps: 'Cook it',
        imageUrl: null,
        suggestedTags: ['chicken', 'my-custom-sauce', 'weird-technique'],
        suggestedNewTags: [{ name: 'weird-technique', section: 'style' }],
      }) }],
    } as unknown as Awaited<ReturnType<typeof anthropic.messages.create>>)

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const res = await POST(
      makeReq('http://localhost/api/recipes/scrape', 'POST', { url: 'https://example.com/recipe' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestedTags).toContain('Chicken')         // canonical casing
    expect(body.suggestedTags).toContain('My-Custom-Sauce') // matched custom
    expect(body.suggestedTags).not.toContain('weird-technique') // unmatched dropped from suggestedTags
    // suggestedNewTags carries {name, section} objects from the LLM
    expect(body.suggestedNewTags).toHaveLength(1)
    expect(body.suggestedNewTags[0]).toMatchObject({ name: 'Weird-Technique', section: 'style' })
  })

  it('T01b (spec-06): suggestedNewTags with invalid section are filtered out', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseMock({}) as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock() as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Pasta',
        ingredients: '200g pasta',
        steps: 'Cook it',
        imageUrl: null,
        suggestedTags: [],
        suggestedNewTags: [
          { name: 'ValidTag', section: 'protein' },
          { name: 'BadTag', section: 'invalid-bucket' },
        ],
      }) }],
    } as unknown as Awaited<ReturnType<typeof anthropic.messages.create>>)

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const res = await POST(
      makeReq('http://localhost/api/recipes/scrape', 'POST', { url: 'https://example.com/recipe' }),
    )
    const body = await res.json()
    expect(body.suggestedNewTags).toHaveLength(1)
    expect(body.suggestedNewTags[0]).toMatchObject({ name: 'ValidTag', section: 'protein' })
  })
})


// ── T_servings: Scrape route returns servings from LLM ──────────────────────

describe('T_servings - Scrape route returns servings from LLM', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns servings when LLM provides it', async () => {
    const mock = makeSupabaseMock({ customTags: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock() as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Pasta',
        ingredients: '200g pasta',
        steps: 'Cook it',
        imageUrl: null,
        suggestedTags: [],
        servings: 4,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        totalTimeMinutes: null,
        inactiveTimeMinutes: null,
      }) }],
    } as unknown as Awaited<ReturnType<typeof anthropic.messages.create>>)

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const res = await POST(
      makeReq('http://localhost/api/recipes/scrape', 'POST', { url: 'https://example.com/recipe' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.servings).toBe(4)
  })

  it('returns null servings when LLM cannot find it', async () => {
    const mock = makeSupabaseMock({ customTags: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock() as unknown as ReturnType<typeof createAdminClient>)
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Pasta',
        ingredients: '200g pasta',
        steps: 'Cook it',
        imageUrl: null,
        suggestedTags: [],
        servings: null,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        totalTimeMinutes: null,
        inactiveTimeMinutes: null,
      }) }],
    } as unknown as Awaited<ReturnType<typeof anthropic.messages.create>>)

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const res = await POST(
      makeReq('http://localhost/api/recipes/scrape', 'POST', { url: 'https://example.com/recipe' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.servings).toBeNull()
  })
})

// ── T25: Recipe log deducts pantry item with null quantity ────────────────────

describe('T25 - POST /api/recipes/[id]/log deducts pantry item with null quantity', () => {
  beforeEach(() => { vi.resetModules() })

  it('deletes a pantry item with null quantity that matches an ingredient', async () => {
    const mock = makeSupabaseMock({ singleResult: { ...sampleRecipe, ingredients: 'pasta' } })
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)

    const pantryItems = [{ id: 'p1', name: 'pasta', quantity: null, user_id: 'user-1' }]
    const adminMock = makeAdminMock({ pantryItems, recipeIngredients: 'pasta' })
    vi.mocked(createAdminClient).mockReturnValue(adminMock as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const res = await POST(
      makeReq(`http://localhost/api/recipes/${sampleRecipe.id}/log`) as Parameters<typeof POST>[0],
      { params: { id: sampleRecipe.id } },
    )

    // HTTP response is unchanged
    expect(res.status).toBe(200)

    // Allow the fire-and-forget deduction to complete
    await new Promise((r) => setTimeout(r, 50))
    expect(adminMock._deletedIds).toContain('p1')
  })
})

// ── T26: Recipe log does NOT deduct pantry item with vague quantity ───────────

describe('T26 - POST /api/recipes/[id]/log does NOT deduct item with quantity "some"', () => {
  beforeEach(() => { vi.resetModules() })

  it('leaves pantry item untouched when quantity is "some"', async () => {
    const mock = makeSupabaseMock({ singleResult: { ...sampleRecipe, ingredients: 'pasta' } })
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)

    const pantryItems = [{ id: 'p2', name: 'pasta', quantity: 'some', user_id: 'user-1' }]
    const adminMock = makeAdminMock({ pantryItems, recipeIngredients: 'pasta' })
    vi.mocked(createAdminClient).mockReturnValue(adminMock as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const res = await POST(
      makeReq(`http://localhost/api/recipes/${sampleRecipe.id}/log`) as Parameters<typeof POST>[0],
      { params: { id: sampleRecipe.id } },
    )

    expect(res.status).toBe(200)

    await new Promise((r) => setTimeout(r, 50))
    expect(adminMock._deletedIds).not.toContain('p2')
  })
})
