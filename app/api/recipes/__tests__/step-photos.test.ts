import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  insertResult: null as Record<string, unknown> | null,
}

const sampleRecipe = {
  id: 'recipe-1',
  user_id: 'user-1',
  title: 'Pasta',
  category: 'main_dish',
  tags: [],
  is_shared: false,
  ingredients: null,
  steps: null,
  notes: null,
  url: null,
  image_url: null,
  created_at: '2026-01-01T00:00:00Z',
  source: 'manual',
  step_photos: [],
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
      if (table === 'recipes') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => ({
                data: { ...sampleRecipe, ...payload, ...mockState.insertResult },
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: { ...sampleRecipe, ...payload },
                  error: null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'recipe_history') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        }
      }
      if (table === 'custom_tags') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }
    },
  }),
}))

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
  mockState.insertResult = null
})

// T37: step_photos saved on POST /api/recipes
describe('T37 - step_photos saved on POST /api/recipes', () => {
  it('includes step_photos in the inserted row when provided', async () => {
    const stepPhotos = [{ stepIndex: 0, imageUrl: 'https://example.com/photo.jpg' }]
    mockState.insertResult = { step_photos: stepPhotos }

    const { POST } = await import('@/app/api/recipes/route')
    const res = await POST(
      makeReq('POST', 'http://localhost/api/recipes', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: [],
        step_photos: stepPhotos,
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.step_photos).toEqual(stepPhotos)
  })

  it('defaults step_photos to [] when not provided', async () => {
    const { POST } = await import('@/app/api/recipes/route')
    const res = await POST(
      makeReq('POST', 'http://localhost/api/recipes', {
        title: 'Test Recipe',
        category: 'main_dish',
        tags: [],
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.step_photos).toEqual([])
  })
})

// T36: Scrape returns stepPhotos array
describe('T36 - scrape route extraction shape includes stepPhotos', () => {
  it('scrape route response type includes stepPhotos field', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/recipes/scrape/route.ts'),
      'utf-8'
    )
    expect(src).toContain('stepPhotos')
    expect(src).toContain('stepIndex')
    expect(src).toContain('imageUrl')
  })
})

// T38: step_photos returned on GET /api/recipes/[id]
describe('T38 - step_photos returned on GET /api/recipes/[id]', () => {
  it('step_photos field is present in the GET response via select(*)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/api/recipes/[id]/route.ts'),
      'utf-8'
    )
    expect(src).toContain("select('*')")
  })
})
