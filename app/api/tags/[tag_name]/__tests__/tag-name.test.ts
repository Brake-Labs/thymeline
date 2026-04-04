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
  // custom_tags row for the tag being operated on
  tagRow: null as { id: string; name: string; section: string } | null,
  // recipes that carry the tag
  affectedRecipes: [] as { id: string; tags: string[] }[],
  // user_preferences hidden_tags
  hiddenTags: [] as string[],
  // recipe count (for GET)
  recipeCount: 0,
}

// ── Chain helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a chainable object that resolves with `{ data, error }`.
 * Supports .eq(), .contains(), .single(), .maybeSingle(), and awaiting.
 */
function makeChain(data: unknown, error: unknown = null): Record<string, unknown> {
  const terminal = { data, error }
  const chain: Record<string, unknown> = {
    eq: () => chain,
    contains: () => chain,
    single: async () => terminal,
    maybeSingle: async () => terminal,
    then: (resolve: (v: unknown) => void) => Promise.resolve(terminal).then(resolve),
  }
  return chain
}

function makeFrom(table: string) {
  if (table === 'custom_tags') {
    return {
      // All selects share the same chain logic:
      //   single()      → tagRow (existence check for both PATCH and DELETE)
      //   maybeSingle() → null   (dupe check in PATCH — no duplicate by default)
      select: () => {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          single: async () => ({
            data: mockState.tagRow,
            error: mockState.tagRow ? null : { code: 'PGRST116' },
          }),
          maybeSingle: async () => ({ data: null, error: null }),
          then: (resolve: (v: unknown) => void) =>
            Promise.resolve({ data: mockState.tagRow, error: null }).then(resolve),
        }
        return chain
      },
      update: () => makeChain(null),
      delete: () => makeChain(null),
    }
  }
  if (table === 'recipes') {
    return {
      select: () => {
        const recipeChain = makeChain(mockState.affectedRecipes)
        // Also expose count for the GET handler which uses { count: 'exact', head: true }
        Object.assign(recipeChain, { count: mockState.recipeCount })
        return recipeChain
      },
      update: () => makeChain(null),
    }
  }
  if (table === 'user_preferences') {
    return {
      select: () =>
        makeChain(
          mockState.hiddenTags.length > 0 ? { hidden_tags: mockState.hiddenTags } : null,
        ),
      upsert: async () => ({ data: null, error: null }),
    }
  }
  return {}
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () =>
  mockSupabase(makeFrom, defaultGetUser(mockState))
)

vi.mock('@/lib/household', () => mockHousehold({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
}))

import { resolveHouseholdScope } from '@/lib/household'
const { GET, PATCH, DELETE } = await import('@/app/api/tags/[tag_name]/route')

beforeEach(() => {
  mockState.user = { id: 'user-1' }
  mockState.tagRow = null
  mockState.affectedRecipes = []
  mockState.hiddenTags = []
  mockState.recipeCount = 0
})

// ── GET /api/tags/:tag_name ───────────────────────────────────────────────────

describe('GET /api/tags/:tag_name', () => {
  it('returns tag name and recipe_count', async () => {
    mockState.recipeCount = 3
    const res = await GET(
      makeRequest('GET', 'http://localhost/api/tags/Chicken'),
      { params: { tag_name: 'Chicken' } },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Chicken')
    expect(typeof body.recipe_count).toBe('number')
  })
})

// ── Spec-19 T5: Rename a custom tag ──────────────────────────────────────────

describe('Spec-19 T5 - PATCH /api/tags/:tag_name renames a custom tag', () => {
  it('returns 200 with new name when tag exists', async () => {
    mockState.tagRow = { id: 'ct-1', name: 'Date Night', section: 'style' }
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/tags/Date%20Night', { name: 'Date Nights' }),
      { params: { tag_name: 'Date%20Night' } },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Date Nights')
  })

  it('returns 404 when tag does not exist', async () => {
    mockState.tagRow = null
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/tags/Unknown', { name: 'Other' }),
      { params: { tag_name: 'Unknown' } },
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when new name matches a first-class tag', async () => {
    mockState.tagRow = { id: 'ct-1', name: 'My Tag', section: 'style' }
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/tags/My%20Tag', { name: 'Chicken' }),
      { params: { tag_name: 'My%20Tag' } },
    )
    expect(res.status).toBe(400)
  })

  it('returns 403 for household member role', async () => {
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({ householdId: 'hh-1', role: 'member' })
    const res = await PATCH(
      makeRequest('PATCH', 'http://localhost/api/tags/MyTag', { name: 'NewName' }),
      { params: { tag_name: 'MyTag' } },
    )
    expect(res.status).toBe(403)
  })
})

// ── Spec-19 T10: Hide first-class tag ────────────────────────────────────────

describe('Spec-19 T10 - DELETE /api/tags/:tag_name hides a first-class tag', () => {
  it('returns 204 for a first-class tag (hide, not delete)', async () => {
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tags/Keto'),
      { params: { tag_name: 'Keto' } },
    )
    expect(res.status).toBe(204)
  })

  it('is idempotent — 204 even when already hidden', async () => {
    mockState.hiddenTags = ['Keto']
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tags/Keto'),
      { params: { tag_name: 'Keto' } },
    )
    expect(res.status).toBe(204)
  })

  it('returns 403 for household member', async () => {
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({ householdId: 'hh-1', role: 'member' })
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tags/Keto'),
      { params: { tag_name: 'Keto' } },
    )
    expect(res.status).toBe(403)
  })
})

// ── Spec-19 T9: Delete custom tag ────────────────────────────────────────────

describe('Spec-19 T9 - DELETE /api/tags/:tag_name deletes a custom tag', () => {
  it('returns 204 and removes the tag', async () => {
    mockState.tagRow = { id: 'ct-1', name: 'WeekNight', section: 'style' }
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tags/WeekNight'),
      { params: { tag_name: 'WeekNight' } },
    )
    expect(res.status).toBe(204)
  })

  it('returns 404 when custom tag does not exist', async () => {
    mockState.tagRow = null
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/tags/NonExistent'),
      { params: { tag_name: 'NonExistent' } },
    )
    expect(res.status).toBe(404)
  })
})
