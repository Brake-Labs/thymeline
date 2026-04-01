import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockSupabase,
  mockHousehold,
  makeRequest,
  defaultGetUser,
  chainMock,
} from '@/test/helpers'

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  tagRow:         null as { id: string } | null,
  tagError:       null as { message: string } | null,
  affectedRecipes: [] as { id: string; tags: string[] }[],
  recipeCount:    0,
}

function makeTagsDeleteFrom(table: string) {
  if (table === 'custom_tags') {
    // select chain: returns tagRow for existence check, chainable delete
    const selectChain = chainMock(mockState.tagRow, mockState.tagError)
    const deleteChain = chainMock(null)
    return {
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    }
  }
  if (table === 'recipes') {
    const selectChain = chainMock(mockState.affectedRecipes)
    const updateChain = chainMock(null)
    return {
      select: vi.fn((cols: string, opts?: unknown) => {
        // head:true count query
        if (opts && typeof opts === 'object' && (opts as Record<string, unknown>)['head']) {
          const countChain = chainMock(null)
          Object.assign(countChain, { count: mockState.recipeCount })
          return countChain
        }
        return selectChain
      }),
      update: vi.fn().mockReturnValue(updateChain),
    }
  }
  return {}
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () =>
  mockSupabase(makeTagsDeleteFrom, defaultGetUser(mockState))
)

vi.mock('@/lib/household', () => mockHousehold({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
}))

import { resolveHouseholdScope } from '@/lib/household'
const { GET, DELETE } = await import('@/app/api/tags/[tag_name]/route')

const makeTagRequest = (method: string, tagName: string) =>
  makeRequest(method, `http://localhost/api/tags/${encodeURIComponent(tagName)}`)

beforeEach(() => {
  mockState.user = { id: 'user-1' }
  mockState.tagRow = null
  mockState.tagError = null
  mockState.affectedRecipes = []
  mockState.recipeCount = 0
  vi.mocked(resolveHouseholdScope).mockResolvedValue(null)
})

// ── GET /api/tags/[tag_name] ──────────────────────────────────────────────────

describe('GET /api/tags/[tag_name]', () => {
  it('returns name and recipe_count', async () => {
    mockState.recipeCount = 3
    const res = await GET(makeTagRequest('GET', 'MyTag'), { params: { tag_name: 'MyTag' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('MyTag')
    expect(typeof body.recipe_count).toBe('number')
  })
})

// ── DELETE /api/tags/[tag_name] — 404 when tag not found ─────────────────────

describe('DELETE /api/tags/[tag_name] — 404', () => {
  it('returns 404 when tag does not exist for the user', async () => {
    mockState.tagRow = null
    const res = await DELETE(makeTagRequest('DELETE', 'NoSuchTag'), { params: { tag_name: 'NoSuchTag' } })
    expect(res.status).toBe(404)
  })
})

// ── DELETE /api/tags/[tag_name] — 403 for household member ───────────────────

describe('DELETE /api/tags/[tag_name] — 403 for member role', () => {
  it('returns 403 when the caller is a household member', async () => {
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })
    const res = await DELETE(makeTagRequest('DELETE', 'MyTag'), { params: { tag_name: 'MyTag' } })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/owner/)
  })
})

// ── DELETE /api/tags/[tag_name] — happy path ─────────────────────────────────

describe('DELETE /api/tags/[tag_name] — 204 success', () => {
  it('returns 204 when tag exists and user has no household', async () => {
    mockState.tagRow = { id: 'tag-id-1' }
    mockState.affectedRecipes = []
    const res = await DELETE(makeTagRequest('DELETE', 'MyTag'), { params: { tag_name: 'MyTag' } })
    expect(res.status).toBe(204)
  })

  it('returns 204 when tag exists and affected recipes get tag removed', async () => {
    mockState.tagRow = { id: 'tag-id-1' }
    mockState.affectedRecipes = [
      { id: 'recipe-1', tags: ['MyTag', 'Italian'] },
      { id: 'recipe-2', tags: ['MyTag'] },
    ]
    const res = await DELETE(makeTagRequest('DELETE', 'MyTag'), { params: { tag_name: 'MyTag' } })
    expect(res.status).toBe(204)
  })

  it('allows co_owner to delete tag', async () => {
    mockState.tagRow = { id: 'tag-id-1' }
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'co_owner',
    })
    const res = await DELETE(makeTagRequest('DELETE', 'MyTag'), { params: { tag_name: 'MyTag' } })
    expect(res.status).toBe(204)
  })
})
