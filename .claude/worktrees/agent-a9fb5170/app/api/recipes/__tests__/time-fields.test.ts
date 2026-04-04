/**
 * Tests for time fields on POST /api/recipes, PATCH /api/recipes/[id],
 * and POST /api/recipes/scrape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }

const sampleRecipe = {
  id: 'recipe-1',
  user_id: 'user-1',
  title: 'Braised Short Ribs',
  category: 'main_dish',
  tags: [],
  is_shared: false,
  ingredients: '2 lbs short ribs',
  steps: 'Brown the ribs\nBraise for 3 hours',
  notes: null,
  url: null,
  image_url: null,
  created_at: '2026-01-01T00:00:00Z',
  prep_time_minutes: 20,
  cook_time_minutes: 180,
  total_time_minutes: 200,
  inactive_time_minutes: null,
}

function makeSupabaseMock(opts: {
  insertResult?: unknown
  updateResult?: unknown
  singleResult?: unknown
  singleError?: { message: string } | null
  customTags?: { name: string }[]
  historyResult?: { made_on: string }[]
} = {}) {
  const {
    insertResult = sampleRecipe,
    updateResult = sampleRecipe,
    singleResult = sampleRecipe,
    singleError = null,
    customTags = [],
    historyResult = [],
  } = opts

  const insertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
  }

  const updateChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: updateResult, error: null }),
  }

  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: singleResult, error: singleError }),
  }

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'custom_tags') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: customTags, error: null }),
          }),
        }
      }
      if (table === 'recipe_history') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: historyResult, error: null }),
          }),
        }
      }
      return {
        insert: vi.fn().mockReturnValue(insertChain),
        update: vi.fn().mockReturnValue(updateChain),
        select: vi.fn().mockReturnValue(selectChain),
        eq: vi.fn().mockReturnThis(),
      }
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
  scopeQuery: (query: unknown) => query,
  scopeInsert: (_userId: string, _ctx: unknown, payload: unknown) => ({ user_id: 'user-1', ...(payload as object) }),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
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

import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { callLLM } from '@/lib/llm'

function makeReq(url: string, method = 'POST', body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── POST /api/recipes time fields ─────────────────────────────────────────────

describe('POST /api/recipes — time fields', () => {
  beforeEach(() => { vi.resetModules() })

  it('saves time fields on create', async () => {
    const mock = makeSupabaseMock({ insertResult: sampleRecipe })
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('@/app/api/recipes/route')
    const req = makeReq('http://localhost/api/recipes', 'POST', {
      title: 'Braised Short Ribs',
      category: 'main_dish',
      prep_time_minutes: 20,
      cook_time_minutes: 180,
      total_time_minutes: 200,
      inactive_time_minutes: null,
    })
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.prep_time_minutes).toBe(20)
    expect(json.cook_time_minutes).toBe(180)
    expect(json.total_time_minutes).toBe(200)
    expect(json.inactive_time_minutes).toBeNull()
  })

  it('saves null time fields when omitted', async () => {
    const noTimeRecipe = {
      ...sampleRecipe,
      prep_time_minutes: null,
      cook_time_minutes: null,
      total_time_minutes: null,
      inactive_time_minutes: null,
    }
    const mock = makeSupabaseMock({ insertResult: noTimeRecipe })
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('@/app/api/recipes/route')
    const req = makeReq('http://localhost/api/recipes', 'POST', {
      title: 'Simple Recipe',
      category: 'main_dish',
    })
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.prep_time_minutes).toBeNull()
    expect(json.cook_time_minutes).toBeNull()
  })
})

// ── PATCH /api/recipes/[id] time fields ───────────────────────────────────────

describe('PATCH /api/recipes/[id] — time fields', () => {
  beforeEach(() => { vi.resetModules() })

  it('updates time fields on patch', async () => {
    const updatedRecipe = { ...sampleRecipe, prep_time_minutes: 30, cook_time_minutes: 60, total_time_minutes: 90 }
    const mock = makeSupabaseMock({
      singleResult: { user_id: 'user-1' },  // ownership check
      updateResult: updatedRecipe,
    })
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('@/app/api/recipes/[id]/route')
    const req = makeReq('http://localhost/api/recipes/recipe-1', 'PATCH', {
      prep_time_minutes: 30,
      cook_time_minutes: 60,
      total_time_minutes: 90,
    })
    const res = await PATCH(req as Parameters<typeof PATCH>[0], { params: { id: 'recipe-1' } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.prep_time_minutes).toBe(30)
    expect(json.cook_time_minutes).toBe(60)
    expect(json.total_time_minutes).toBe(90)
  })
})

// ── POST /api/recipes/scrape time fields ──────────────────────────────────────

describe('POST /api/recipes/scrape — time fields', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.FIRECRAWL_API_KEY = 'test-key'
  })

  it('returns time fields extracted from LLM response', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
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
    const req = makeReq('http://localhost/api/recipes/scrape', 'POST', {
      url: 'https://example.com/braised-short-ribs',
    })
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.prepTimeMinutes).toBe(20)
    expect(json.cookTimeMinutes).toBe(180)
    expect(json.totalTimeMinutes).toBe(200)
    expect(json.inactiveTimeMinutes).toBeNull()
  })

  it('returns null time fields when LLM cannot extract them', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
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
    const req = makeReq('http://localhost/api/recipes/scrape', 'POST', {
      url: 'https://example.com/mystery',
    })
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.prepTimeMinutes).toBeNull()
    expect(json.cookTimeMinutes).toBeNull()
    expect(json.totalTimeMinutes).toBeNull()
    expect(json.inactiveTimeMinutes).toBeNull()
    // partial = true because all time is null AND ingredients are present
    expect(json.partial).toBe(true)
  })

  it('sets partial = false when all core fields AND time fields are present', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
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
    const req = makeReq('http://localhost/api/recipes/scrape', 'POST', {
      url: 'https://example.com/quick-pasta',
    })
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.partial).toBe(false)
  })
})
