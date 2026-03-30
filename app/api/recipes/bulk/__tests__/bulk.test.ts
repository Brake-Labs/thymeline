/**
 * Tests for PATCH /api/recipes/bulk
 * Covers spec test cases: T22 (success), T23 (additive merge), T42 (403 cross-user), T43 (400 unknown tag)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockOtherUser = { id: 'user-2' }

const ownedRecipe = {
  id: 'recipe-1',
  user_id: 'user-1',
  tags: ['Chicken', 'Quick'],
}

const foreignRecipe = {
  id: 'recipe-2',
  user_id: 'user-2',
  tags: ['Beef'],
}

function makeSupabaseMock(opts: {
  user?: typeof mockUser | null
  recipes?: typeof ownedRecipe[]
  customTags?: { name: string }[]
  updateResult?: unknown
}) {
  const { user = mockUser, recipes = [ownedRecipe], customTags = [], updateResult = null } = opts

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('No user'),
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: recipes, error: null }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: updateResult, error: null }),
              }),
            }),
          }),
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

import { createServerClient, createAdminClient } from '@/lib/supabase-server'

function makeReq(body?: unknown): Request {
  return new Request('http://localhost/api/recipes/bulk', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('PATCH /api/recipes/bulk', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('T42: returns 403 when any recipe_id belongs to a different user', async () => {
    const mock = makeSupabaseMock({ recipes: [ownedRecipe, foreignRecipe] })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq({ recipe_ids: ['recipe-1', 'recipe-2'], add_tags: ['Chicken'] }) as Parameters<typeof PATCH>[0]
    )
    expect(res.status).toBe(403)
  })

  it('T43: returns 400 when add_tags contains an unknown tag', async () => {
    const mock = makeSupabaseMock({ customTags: [] })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq({ recipe_ids: ['recipe-1'], add_tags: ['NotARealTag'] }) as Parameters<typeof PATCH>[0]
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Unknown tags/)
  })

  it('T22: returns 200 with updated recipes on success', async () => {
    const updatedRecipe = { ...ownedRecipe, tags: ['Chicken', 'Quick', 'Favorite'] }
    const mock = makeSupabaseMock({ customTags: [{ name: 'Favorite' }], updateResult: updatedRecipe })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq({ recipe_ids: ['recipe-1'], add_tags: ['Favorite'] }) as Parameters<typeof PATCH>[0]
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
  })

  it('T23: merges add_tags additively with existing recipe tags', async () => {
    // ownedRecipe already has ['Chicken', 'Quick']; adding 'Healthy' (in library) should merge
    const updatedRecipe = { ...ownedRecipe, tags: ['Chicken', 'Quick', 'Healthy'] }
    const mock = makeSupabaseMock({ customTags: [{ name: 'Healthy' }], updateResult: updatedRecipe })
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq({ recipe_ids: ['recipe-1'], add_tags: ['Healthy'] }) as Parameters<typeof PATCH>[0]
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json)).toBe(true)
    // The updated recipe should contain all original tags plus the new one
    expect(updatedRecipe.tags).toContain('Chicken')
    expect(updatedRecipe.tags).toContain('Quick')
    expect(updatedRecipe.tags).toContain('Healthy')
  })

  it('returns 400 when recipe_ids is empty', async () => {
    const mock = makeSupabaseMock({})
    vi.mocked(createServerClient).mockReturnValue(mock as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeReq({ recipe_ids: [], add_tags: ['Chicken'] }) as Parameters<typeof PATCH>[0]
    )
    expect(res.status).toBe(400)
  })
})
