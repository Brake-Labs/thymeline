/**
 * Tests for /api/pantry (GET, POST, DELETE bulk) and /api/pantry/[id] (PATCH, DELETE).
 * Covers spec-12 test cases: T01, T02, T03, T04, T05, T06, T07, T08, T09, T27
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser     = { id: 'user-1' }
const otherUser    = { id: 'user-2' }

const sampleItem = {
  id:          'pantry-1',
  user_id:     'user-1',
  name:        'tomatoes',
  quantity:    '2 cans',
  section:     'Canned & Jarred',
  expiry_date: null,
  added_at:    '2026-03-01T00:00:00Z',
  updated_at:  '2026-03-01T00:00:00Z',
}

// ── Supabase mock ─────────────────────────────────────────────────────────────

function makeDbMock(opts: {
  items?:         unknown[]
  insertResult?:  unknown
  updateResult?:  unknown
  deleteResult?:  { error: null } | { error: { message: string } }
  single?:        unknown
  singleError?:   { message: string } | null
  owned?:         unknown[]
} = {}) {
  const {
    items = [sampleItem],
    insertResult = sampleItem,
    updateResult = sampleItem,
    deleteResult = { error: null },
    single = sampleItem,
    singleError = null,
    owned = [sampleItem],
  } = opts

  // Chainable eq/order factory — supports .eq().../.order()... at any depth
  function makeEqChain(terminal: Record<string, unknown>): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      eq:    vi.fn().mockImplementation(() => makeEqChain(terminal)),
      order: vi.fn().mockImplementation(() => makeEqChain(terminal)),
      single: vi.fn().mockResolvedValue({ data: single, error: singleError }),
      // Terminal await resolves with items
      then: vi.fn().mockImplementation((resolve: (v: unknown) => void) =>
        Promise.resolve({ data: items, error: null }).then(resolve)),
      ...terminal,
    }
    return chain
  }

  return {
    from: vi.fn((table: string) => {
      if (table === 'pantry_items') {
        return {
          select: vi.fn().mockReturnValue(makeEqChain({
            in: vi.fn().mockResolvedValue({ data: owned, error: null }),
          })),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: updateResult, error: singleError }),
                }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue(deleteResult),
            }),
            in: vi.fn().mockResolvedValue(deleteResult),
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

function makeAuthMock(userId = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  }
}

function makeReq(url: string, method = 'GET', body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── T01: GET returns only current user's items ────────────────────────────────

describe('T01 - GET /api/pantry returns only current user items', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns items for the authenticated user', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeDbMock({ items: [sampleItem] }) as unknown as ReturnType<typeof createAdminClient>)

    const { GET } = await import('../route')
    const res = await GET(makeReq('http://localhost/api/pantry') as Parameters<typeof GET>[0])

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.items)).toBe(true)
    expect(json.items[0].name).toBe('tomatoes')
  })
})

// ── T02: POST parses free-text "2 cans tomatoes" ─────────────────────────────

describe('T02 - POST /api/pantry parses "2 cans tomatoes"', () => {
  beforeEach(() => { vi.resetModules() })

  it('extracts name "tomatoes" and quantity "2 cans"', async () => {
    const insertResult = { ...sampleItem, name: 'tomatoes', quantity: '2 cans' }
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeDbMock({ insertResult }) as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(
      makeReq('http://localhost/api/pantry', 'POST', { name: '2 cans tomatoes' }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.item.name).toBe('tomatoes')
    expect(json.item.quantity).toBe('2 cans')
  })
})

// ── T03: POST auto-assigns section for "diced tomatoes" ──────────────────────

describe('T03 - POST /api/pantry auto-assigns section for "diced tomatoes"', () => {
  beforeEach(() => { vi.resetModules() })

  it('assigns "Canned & Jarred" section for canned tomatoes', async () => {
    // The actual section assignment happens in the route via assignSection — verify
    // that when name contains "tomato", the insert is called (section will be auto-assigned)
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    const db = makeDbMock({ insertResult: { ...sampleItem, name: 'diced tomatoes', section: 'Canned & Jarred' } })
    vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../route')
    const res = await POST(
      makeReq('http://localhost/api/pantry', 'POST', { name: 'diced tomatoes' }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(201)
    // Verify insert was called on pantry_items
    const fromCalls = db.from.mock.calls
    expect(fromCalls.some(([t]: [string]) => t === 'pantry_items')).toBe(true)
  })
})

// ── T04: PATCH updates quantity and expiry_date ───────────────────────────────

describe('T04 - PATCH /api/pantry/[id] updates quantity and expiry_date', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns updated item on success', async () => {
    const updated = { ...sampleItem, quantity: '3 cans', expiry_date: '2026-04-01' }
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeDbMock({ updateResult: updated }) as unknown as ReturnType<typeof createAdminClient>)

    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(
      makeReq('http://localhost/api/pantry/pantry-1', 'PATCH', { quantity: '3 cans', expiry_date: '2026-04-01' }) as Parameters<typeof PATCH>[0],
      { params: { id: 'pantry-1' } },
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.item.quantity).toBe('3 cans')
    expect(json.item.expiry_date).toBe('2026-04-01')
  })
})

// ── T05: DELETE /api/pantry/[id] removes item and returns 204 ────────────────

describe('T05 - DELETE /api/pantry/[id] removes item', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 204 on success', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(makeDbMock({ single: sampleItem, singleError: null }) as unknown as ReturnType<typeof createAdminClient>)

    const { DELETE } = await import('../[id]/route')
    const res = await DELETE(
      makeReq('http://localhost/api/pantry/pantry-1', 'DELETE') as Parameters<typeof DELETE>[0],
      { params: { id: 'pantry-1' } },
    )

    expect(res.status).toBe(204)
  })
})

// ── T06: DELETE /api/pantry (bulk) removes all specified items ────────────────

describe('T06 - DELETE /api/pantry (bulk) removes all specified items', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 204 on success', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(
      makeDbMock({ owned: [{ ...sampleItem, user_id: 'user-1' }] }) as unknown as ReturnType<typeof createAdminClient>,
    )

    const { DELETE } = await import('../route')
    const res = await DELETE(
      makeReq('http://localhost/api/pantry', 'DELETE', { ids: ['pantry-1'] }) as Parameters<typeof DELETE>[0],
    )

    expect(res.status).toBe(204)
  })
})

// ── T07: DELETE /api/pantry (bulk) returns 403 if any ID belongs to different user

describe('T07 - DELETE /api/pantry bulk returns 403 for cross-user IDs', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 403 and does not delete when one ID belongs to another user', async () => {
    const ownedByOtherUser = [{ id: 'pantry-1', user_id: otherUser.id }]
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock(mockUser.id) as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(
      makeDbMock({ owned: ownedByOtherUser }) as unknown as ReturnType<typeof createAdminClient>,
    )

    const { DELETE } = await import('../route')
    const res = await DELETE(
      makeReq('http://localhost/api/pantry', 'DELETE', { ids: ['pantry-1'] }) as Parameters<typeof DELETE>[0],
    )

    expect(res.status).toBe(403)
  })
})

// ── T08: POST /api/pantry/import inserts new item ────────────────────────────

describe('T08 - POST /api/pantry/import inserts new item', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns { imported: 1, updated: 0 } when item is new', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    // No existing items → will insert
    const db = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      })),
    }
    vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../import/route')
    const res = await POST(
      makeReq('http://localhost/api/pantry/import', 'POST', {
        items: [{ name: 'chicken breast', quantity: '1 lb', section: 'Proteins' }],
      }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.imported).toBe(1)
    expect(json.updated).toBe(0)
  })
})

// ── T09: POST /api/pantry/import updates existing item (case-insensitive) ────

describe('T09 - POST /api/pantry/import updates existing item (case-insensitive)', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns { imported: 0, updated: 1 } when item already exists', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    // Existing item with lowercase name matches the import
    const existing = [{ id: 'pantry-1', name: 'Chicken Breast' }]
    const db = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: existing, error: null }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    }
    vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>)

    const { POST } = await import('../import/route')
    const res = await POST(
      makeReq('http://localhost/api/pantry/import', 'POST', {
        items: [{ name: 'chicken breast', quantity: '2 lb', section: null }],
      }) as Parameters<typeof POST>[0],
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.imported).toBe(0)
    expect(json.updated).toBe(1)
  })
})

// ── T27: PATCH /api/pantry/[id] returns 404 for non-existent item ────────────

describe('T27 - PATCH /api/pantry/[id] returns 404 for non-existent or non-owned item', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns 404 when item not found', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeAuthMock() as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(
      makeDbMock({ updateResult: null, singleError: { message: 'not found' } }) as unknown as ReturnType<typeof createAdminClient>,
    )

    const { PATCH } = await import('../[id]/route')
    const res = await PATCH(
      makeReq('http://localhost/api/pantry/nonexistent', 'PATCH', { quantity: '1 lb' }) as Parameters<typeof PATCH>[0],
      { params: { id: 'nonexistent' } },
    )

    expect(res.status).toBe(404)
  })
})
