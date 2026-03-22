import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  customTags: [] as { id: string; name: string; section: string }[],
  insertResult: null as { id: string; name: string; section: string } | null,
  insertError: null as { message: string } | null,
}

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockState.user },
        error: mockState.user ? null : { message: 'no user' },
      }),
    },
    from: (table: string) => {
      if (table === 'custom_tags') {
        return {
          select: () => ({
            eq: () => ({
              // For the full list fetch (duplicate check)
              then: (resolve: (v: unknown) => void) =>
                resolve({ data: mockState.customTags, error: null }),
              // For order (GET route)
              order: () =>
                Promise.resolve({ data: mockState.customTags, error: null }),
              // Chained select().eq() for duplicate check path
              select: () => ({
                eq: () =>
                  Promise.resolve({ data: mockState.customTags, error: null }),
              }),
            }),
          }),
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
    },
  }),
}))

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

  it('returns 401 for unauthenticated request', async () => {
    mockState.user = null
    const res = await GET(makeReq('GET', 'http://localhost/api/tags'))
    expect(res.status).toBe(401)
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

  it('returns 401 for unauthenticated request', async () => {
    mockState.user = null
    const res = await POST(makeReq('POST', 'http://localhost/api/tags', { name: 'NewTag' }))
    expect(res.status).toBe(401)
  })
})
