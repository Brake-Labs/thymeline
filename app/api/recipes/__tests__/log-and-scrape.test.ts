/**
 * Tests for the log and scrape routes.
 * Covers spec test cases: T01, T02, T06, T07
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

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
} = {}) {
  const { insertError = null, singleResult = sampleRecipe, singleError = null } = opts

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
      return {}
    }),
  }
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
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

import { createServerClient } from '@/lib/supabase-server'
import { anthropic } from '@/lib/llm'

function makeReq(url: string, method = 'POST', body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── Log tests ─────────────────────────────────────────────────────────────────

describe('POST /api/recipes/[id]/log', () => {
  beforeEach(() => { vi.resetModules() })

  it('T06: logs a new cook entry and returns already_logged = false', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)

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
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/recipes/[id]/log/route')
    const req = makeReq(`http://localhost/api/recipes/${sampleRecipe.id}/log`)
    const res = await POST(req as Parameters<typeof POST>[0], { params: { id: sampleRecipe.id } })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.already_logged).toBe(true)
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
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Pasta Carbonara',
        ingredients: '200g pasta\n100g pancetta',
        steps: 'Cook pasta\nFry pancetta\nCombine',
        imageUrl: 'https://example.com/pasta.jpg',
      }) }],
    } as any)

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
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(anthropic.messages.create).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Pasta Carbonara',
        ingredients: '200g pasta',
        steps: null,
        imageUrl: null,
      }) }],
    } as any)

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
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeReq('http://localhost/api/recipes/scrape', 'POST', {})
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid URL', async () => {
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/recipes/scrape/route')
    const req = makeReq('http://localhost/api/recipes/scrape', 'POST', { url: 'not-a-url' })
    const res = await POST(req as Parameters<typeof POST>[0])

    expect(res.status).toBe(400)
  })
})
