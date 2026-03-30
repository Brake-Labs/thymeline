import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock state ─────────────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  // resolveHouseholdScope result — null = solo user
  membership: null as { household_id: string; role: string } | null,
  household: null as { id: string; name: string; owner_id: string; created_at: string } | null,
  members: [] as { household_id: string; user_id: string; role: string; joined_at: string }[],
  invite: null as { id: string; household_id: string; token: string; used_by: string | null; expires_at: string } | null,
  recipes: [] as { id: string; user_id: string; household_id: string | null }[],
  pantryItems: [] as { id: string; user_id: string; household_id: string | null }[],
  customTags: [] as { id: string; user_id: string; household_id: string | null }[],
  userPrefs: null as Record<string, unknown> | null,
  householdPrefs: null as Record<string, unknown> | null,
  // Error injection
  householdInsertError: null as { message: string; code?: string } | null,
  memberInsertError: null as { message: string; code?: string } | null,
}

// ── Call tracking ─────────────────────────────────────────────────────────────

const calls = {
  recipesUpdate: [] as Record<string, unknown>[],
  pantryUpdate: [] as Record<string, unknown>[],
  tagsUpdate: [] as Record<string, unknown>[],
  inviteUpdate: [] as Record<string, unknown>[],
  memberInsert: [] as Record<string, unknown>[],
  householdsInsert: [] as Record<string, unknown>[],
}

function resetCalls() {
  calls.recipesUpdate = []
  calls.pantryUpdate = []
  calls.tagsUpdate = []
  calls.inviteUpdate = []
  calls.memberInsert = []
  calls.householdsInsert = []
}

// ── Fluent filter builder helper ──────────────────────────────────────────────

function makeMemberChain(
  rows: typeof mockState.members,
  filters: Record<string, unknown> = {},
) {
  const getMatching = () =>
    rows.filter((m) =>
      Object.entries(filters).every(([k, v]) => (m as Record<string, unknown>)[k] === v),
    )

  const chain: {
    eq: (col: string, val: unknown) => ReturnType<typeof makeMemberChain>
    single: () => Promise<{ data: (typeof rows)[0] | null; error: { message: string } | null }>
    maybeSingle: () => Promise<{ data: (typeof rows)[0] | null; error: null }>
    then: (resolve: (v: { data: typeof rows; error: null }) => unknown) => Promise<unknown>
  } = {
    eq: (col, val) => makeMemberChain(rows, { ...filters, [col]: val }),
    single: async () => {
      const match = getMatching()[0] ?? null
      return { data: match, error: match ? null : { message: 'not found' } }
    },
    maybeSingle: async () => ({ data: getMatching()[0] ?? null, error: null }),
    then: (resolve) => Promise.resolve({ data: getMatching(), error: null }).then(resolve),
  }
  return chain
}

// ── Table mocks ───────────────────────────────────────────────────────────────

function makeMockFrom(table: string) {
  if (table === 'household_members') {
    return {
      select: () => makeMemberChain(mockState.members),
      insert: (payload: Record<string, unknown>) => {
        calls.memberInsert.push(payload)
        if (mockState.memberInsertError) {
          return {
            error: mockState.memberInsertError,
            then: (resolve: (v: { error: typeof mockState.memberInsertError }) => void) =>
              resolve({ error: mockState.memberInsertError }),
          }
        }
        return {
          error: null,
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        }
      },
      update: (payload: Record<string, unknown>) => ({
        eq: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    }
  }

  if (table === 'households') {
    return {
      insert: (payload: Record<string, unknown>) => {
        calls.householdsInsert.push(payload)
        return {
          select: () => ({
            single: async () => ({
              data: mockState.householdInsertError
                ? null
                : { id: 'h-1', name: payload.name, owner_id: payload.owner_id, created_at: '2026-01-01' },
              error: mockState.householdInsertError,
            }),
          }),
        }
      },
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: mockState.household,
            error: mockState.household ? null : { message: 'no row' },
          }),
        }),
      }),
      update: () => ({
        eq: (_col: string, _val: string) => ({
          select: () => ({
            single: async () => ({ data: mockState.household, error: null }),
          }),
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        }),
      }),
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    }
  }

  if (table === 'household_invites') {
    return {
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => ({
            data: {
              id: 'inv-1',
              ...payload,
              token: 'mock-token-uuid',
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              used_by: null,
            },
            error: null,
          }),
        }),
      }),
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: mockState.invite,
            error: mockState.invite ? null : { message: 'not found' },
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        calls.inviteUpdate.push(payload)
        return { eq: () => ({ then: (r: (v: { error: null }) => void) => r({ error: null }) }) }
      },
    }
  }

  if (table === 'recipes') {
    return {
      select: () => ({
        eq: () => ({
          is: async () => ({ data: mockState.recipes, error: null }),
          eq: async () => ({ data: mockState.recipes, error: null }),
          in: async () => ({ data: mockState.recipes, error: null }),
          single: async () => ({ data: mockState.recipes[0] ?? null, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        calls.recipesUpdate.push(payload)
        return {
          eq: () => ({
            is: async () => ({ error: null }),
            eq: async () => ({ error: null }),
          }),
        }
      },
    }
  }

  if (table === 'pantry_items') {
    return {
      select: () => ({
        eq: () => ({
          is: async () => ({ data: mockState.pantryItems, error: null }),
          order: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        calls.pantryUpdate.push(payload)
        return { eq: () => ({ is: async () => ({ error: null }) }) }
      },
    }
  }

  if (table === 'custom_tags') {
    return {
      select: () => ({
        eq: () => ({
          is: async () => ({ data: mockState.customTags, error: null }),
          order: async () => ({ data: [], error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        calls.tagsUpdate.push(payload)
        return { eq: () => ({ is: async () => ({ error: null }) }) }
      },
    }
  }

  if (table === 'user_preferences') {
    return {
      select: () => ({
        eq: (col: string) => ({
          single: async () => ({
            data: col === 'household_id' ? mockState.householdPrefs : mockState.userPrefs,
            error: null,
          }),
          maybeSingle: async () => ({
            data: col === 'household_id' ? mockState.householdPrefs : mockState.userPrefs,
            error: null,
          }),
        }),
      }),
      upsert: async () => ({ error: null }),
    }
  }

  return {}
}

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockState.user },
        error: mockState.user ? null : { message: 'no user' },
      }),
    },
    from: makeMockFrom,
  }),
  createAdminClient: () => ({
    from: makeMockFrom,
    auth: { admin: { listUsers: async () => ({ data: { users: [] } }) } },
  }),
}))

// resolveHouseholdScope is fully mocked — returns based on mockState.membership
vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async (_db: unknown, _userId: string) => {
    if (!mockState.membership) return null
    return { householdId: mockState.membership.household_id, role: mockState.membership.role }
  },
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
}))

// ── Import routes ─────────────────────────────────────────────────────────────

const { POST: householdPOST, GET: householdGET, DELETE: householdDELETE } =
  await import('@/app/api/household/route')
const { POST: invitePOST } = await import('@/app/api/household/invite/route')
const { GET: validateGET } = await import('@/app/api/household/invite/validate/route')
const { POST: joinPOST } = await import('@/app/api/household/join/route')
const { DELETE: memberDELETE } = await import('@/app/api/household/members/[user_id]/route')
const { POST: transferPOST } = await import('@/app/api/household/transfer/route')

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  mockState.membership = null
  mockState.household = { id: 'h-1', name: 'Test House', owner_id: 'user-1', created_at: '2026-01-01' }
  mockState.members = []
  mockState.invite = null
  mockState.recipes = []
  mockState.pantryItems = []
  mockState.customTags = []
  mockState.userPrefs = null
  mockState.householdPrefs = null
  mockState.householdInsertError = null
  mockState.memberInsertError = null
  resetCalls()
})

// ── T01: Solo user creates household ─────────────────────────────────────────

describe('T01 - POST /api/household creates household', () => {
  it('creates household and inserts owner member row', async () => {
    const res = await householdPOST(
      makeReq('POST', 'http://localhost/api/household', { name: 'The Smiths' }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('The Smiths')
    expect(calls.memberInsert.length).toBe(1)
    expect((calls.memberInsert[0] as { role: string }).role).toBe('owner')
  })
})

// ── T02: User tries to create second household ────────────────────────────────

describe('T02 - POST /api/household returns 409 if already in household', () => {
  it('returns 409 when user is already in a household', async () => {
    mockState.membership = { household_id: 'h-1', role: 'owner' }
    const res = await householdPOST(
      makeReq('POST', 'http://localhost/api/household', { name: 'Another House' }),
    )
    expect(res.status).toBe(409)
  })
})

// ── T03: Owner generates invite ───────────────────────────────────────────────

describe('T03 - POST /api/household/invite generates invite URL', () => {
  it('returns invite_url and expires_at for owner', async () => {
    mockState.membership = { household_id: 'h-1', role: 'owner' }
    const res = await invitePOST(makeReq('POST', 'http://localhost/api/household/invite'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.invite_url).toContain('/household/join?token=')
    expect(body.expires_at).toBeDefined()
  })

  it('returns 403 for member role', async () => {
    mockState.membership = { household_id: 'h-1', role: 'member' }
    const res = await invitePOST(makeReq('POST', 'http://localhost/api/household/invite'))
    expect(res.status).toBe(403)
  })
})

// ── T04: Validate valid token ─────────────────────────────────────────────────

describe('T04 - GET /api/household/invite/validate — valid token', () => {
  it('returns valid: true with household_name', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    mockState.invite = {
      id: 'inv-1',
      household_id: 'h-1',
      token: 'abc',
      used_by: null,
      expires_at: expiresAt,
    }
    const res = await validateGET(
      makeReq('GET', 'http://localhost/api/household/invite/validate?token=abc'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.household_name).toBeDefined()
  })
})

// ── T05: Validate used token ──────────────────────────────────────────────────

describe('T05 - GET /api/household/invite/validate — used token', () => {
  it('returns valid: false', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    mockState.invite = {
      id: 'inv-1',
      household_id: 'h-1',
      token: 'abc',
      used_by: 'user-2',
      expires_at: expiresAt,
    }
    const res = await validateGET(
      makeReq('GET', 'http://localhost/api/household/invite/validate?token=abc'),
    )
    const body = await res.json()
    expect(body.valid).toBe(false)
  })
})

// ── T06: Validate expired token ───────────────────────────────────────────────

describe('T06 - GET /api/household/invite/validate — expired token', () => {
  it('returns valid: false', async () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString()
    mockState.invite = {
      id: 'inv-1',
      household_id: 'h-1',
      token: 'abc',
      used_by: null,
      expires_at: expiresAt,
    }
    const res = await validateGET(
      makeReq('GET', 'http://localhost/api/household/invite/validate?token=abc'),
    )
    const body = await res.json()
    expect(body.valid).toBe(false)
  })
})

// ── T07: User joins via token ─────────────────────────────────────────────────

describe('T07 - POST /api/household/join migrates solo data', () => {
  it('inserts member row, marks invite used, migrates recipes/pantry/tags', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    mockState.invite = {
      id: 'inv-1',
      household_id: 'h-1',
      token: 'abc',
      used_by: null,
      expires_at: expiresAt,
    }
    mockState.recipes = [{ id: 'r1', user_id: 'user-1', household_id: null }]
    mockState.pantryItems = [{ id: 'p1', user_id: 'user-1', household_id: null }]
    mockState.customTags = [{ id: 't1', user_id: 'user-1', household_id: null }]

    const res = await joinPOST(
      makeReq('POST', 'http://localhost/api/household/join', { token: 'abc' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.household_id).toBe('h-1')
    expect(calls.memberInsert.length).toBeGreaterThanOrEqual(1)
    expect(calls.inviteUpdate.length).toBeGreaterThanOrEqual(1)
    expect(calls.recipesUpdate.length).toBeGreaterThanOrEqual(1)
    expect(calls.pantryUpdate.length).toBeGreaterThanOrEqual(1)
    expect(calls.tagsUpdate.length).toBeGreaterThanOrEqual(1)
  })
})

// ── T08: User tries to join second household ──────────────────────────────────

describe('T08 - POST /api/household/join returns 409 if already in household', () => {
  it('returns 409', async () => {
    mockState.membership = { household_id: 'h-1', role: 'member' }
    const res = await joinPOST(
      makeReq('POST', 'http://localhost/api/household/join', { token: 'abc' }),
    )
    expect(res.status).toBe(409)
  })
})

// ── T09: Member leaves household ─────────────────────────────────────────────

describe('T09 - DELETE /api/household/members/[user_id] — member leaves', () => {
  it('returns 204 for self-leave as member', async () => {
    mockState.membership = { household_id: 'h-1', role: 'member' }
    mockState.members = [
      { household_id: 'h-1', user_id: 'user-1', role: 'member', joined_at: '2026-01-01' },
      { household_id: 'h-1', user_id: 'user-2', role: 'owner', joined_at: '2026-01-01' },
    ]
    const res = await memberDELETE(
      makeReq('DELETE', 'http://localhost/api/household/members/user-1'),
      { params: { user_id: 'user-1' } },
    )
    expect(res.status).toBe(204)
  })
})

// ── T10: Owner cannot leave without transferring ──────────────────────────────

describe('T10 - DELETE /api/household/members/[user_id] — owner cannot leave', () => {
  it('returns 400 with transfer message', async () => {
    mockState.membership = { household_id: 'h-1', role: 'owner' }
    mockState.members = [
      { household_id: 'h-1', user_id: 'user-1', role: 'owner', joined_at: '2026-01-01' },
      { household_id: 'h-1', user_id: 'user-2', role: 'member', joined_at: '2026-01-01' },
    ]
    const res = await memberDELETE(
      makeReq('DELETE', 'http://localhost/api/household/members/user-1'),
      { params: { user_id: 'user-1' } },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/transfer/i)
  })
})

// ── T11: co_owner cannot remove owner ────────────────────────────────────────

describe('T11 - DELETE /api/household/members/[user_id] — co_owner cannot remove owner', () => {
  it('returns 403', async () => {
    mockState.user = { id: 'user-2' }
    mockState.membership = { household_id: 'h-1', role: 'co_owner' }
    mockState.members = [
      { household_id: 'h-1', user_id: 'user-1', role: 'owner', joined_at: '2026-01-01' },
      { household_id: 'h-1', user_id: 'user-2', role: 'co_owner', joined_at: '2026-01-01' },
    ]
    const res = await memberDELETE(
      makeReq('DELETE', 'http://localhost/api/household/members/user-1'),
      { params: { user_id: 'user-1' } },
    )
    expect(res.status).toBe(403)
  })
})

// ── T12: member cannot remove another member ──────────────────────────────────

describe('T12 - DELETE /api/household/members/[user_id] — member cannot remove others', () => {
  it('returns 403', async () => {
    mockState.user = { id: 'user-2' }
    mockState.membership = { household_id: 'h-1', role: 'member' }
    mockState.members = [
      { household_id: 'h-1', user_id: 'user-1', role: 'owner', joined_at: '2026-01-01' },
      { household_id: 'h-1', user_id: 'user-2', role: 'member', joined_at: '2026-01-01' },
      { household_id: 'h-1', user_id: 'user-3', role: 'member', joined_at: '2026-01-01' },
    ]
    const res = await memberDELETE(
      makeReq('DELETE', 'http://localhost/api/household/members/user-3'),
      { params: { user_id: 'user-3' } },
    )
    expect(res.status).toBe(403)
  })
})

// ── T13: Owner transfers ownership ────────────────────────────────────────────

describe('T13 - POST /api/household/transfer', () => {
  it('returns 200 for owner', async () => {
    mockState.membership = { household_id: 'h-1', role: 'owner' }
    mockState.members = [
      { household_id: 'h-1', user_id: 'user-1', role: 'owner', joined_at: '2026-01-01' },
      { household_id: 'h-1', user_id: 'user-2', role: 'member', joined_at: '2026-01-01' },
    ]
    const res = await transferPOST(
      makeReq('POST', 'http://localhost/api/household/transfer', { new_owner_id: 'user-2' }),
    )
    expect(res.status).toBe(200)
  })

  it('returns 403 for non-owner', async () => {
    mockState.membership = { household_id: 'h-1', role: 'co_owner' }
    const res = await transferPOST(
      makeReq('POST', 'http://localhost/api/household/transfer', { new_owner_id: 'user-2' }),
    )
    expect(res.status).toBe(403)
  })
})

// ── T14: Owner deletes household ──────────────────────────────────────────────

describe('T14 - DELETE /api/household', () => {
  it('returns 204 for owner', async () => {
    mockState.membership = { household_id: 'h-1', role: 'owner' }
    const res = await householdDELETE(makeReq('DELETE', 'http://localhost/api/household'))
    expect(res.status).toBe(204)
  })

  it('returns 403 for co_owner', async () => {
    mockState.membership = { household_id: 'h-1', role: 'co_owner' }
    const res = await householdDELETE(makeReq('DELETE', 'http://localhost/api/household'))
    expect(res.status).toBe(403)
  })
})

// ── T26: GET /api/household — solo user ──────────────────────────────────────

describe('T26 - GET /api/household — solo user', () => {
  it('returns { household: null }', async () => {
    mockState.membership = null
    const res = await householdGET(makeReq('GET', 'http://localhost/api/household'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.household).toBeNull()
  })
})

// ── T27: GET /api/household — household member ────────────────────────────────

describe('T27 - GET /api/household — member gets household + members', () => {
  it('returns household and members array', async () => {
    mockState.membership = { household_id: 'h-1', role: 'owner' }
    mockState.members = [
      { household_id: 'h-1', user_id: 'user-1', role: 'owner', joined_at: '2026-01-01' },
    ]
    const res = await householdGET(makeReq('GET', 'http://localhost/api/household'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.household).toBeDefined()
    expect(body.household.id).toBe('h-1')
    expect(Array.isArray(body.members)).toBe(true)
  })
})

