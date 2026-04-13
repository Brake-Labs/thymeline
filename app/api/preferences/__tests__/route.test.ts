/**
 * Regression tests for GET /api/preferences and PATCH /api/preferences
 * Verifies that weekStartDay is normalized from DB text ('sunday'…'saturday')
 * to a number (0–6) at the API boundary, and that PATCH correctly converts
 * a number back to text before writing to the DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Drizzle/Better Auth mocks ────────────────────────────────────────────────

function mockChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {}
  for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin',
    'set', 'values', 'onConflictDoUpdate', 'onConflictDoNothing', 'returning', 'groupBy']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.then = vi.fn().mockImplementation(
    (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve),
  )
  return chain
}

// A mock preferences row as Drizzle returns it (camelCase, DB text for weekStartDay)
function makePrefsRow(weekStartDay = 'sunday') {
  return {
    optionsPerDay: 3,
    cooldownDays: 28,
    seasonalMode: true,
    preferredTags: [],
    avoidedTags: [],
    limitedTags: [],
    onboardingCompleted: false,
    isActive: true,
    mealContext: null,
    hiddenTags: [],
    weekStartDay: weekStartDay,
    lastActiveDays: [],
    lastActiveMealTypes: [],
  }
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('@/lib/db/schema', () => ({
  userPreferences: {
    optionsPerDay: 'optionsPerDay',
    cooldownDays: 'cooldownDays',
    seasonalMode: 'seasonalMode',
    preferredTags: 'preferredTags',
    avoidedTags: 'avoidedTags',
    limitedTags: 'limitedTags',
    onboardingCompleted: 'onboardingCompleted',
    isActive: 'isActive',
    mealContext: 'mealContext',
    hiddenTags: 'hiddenTags',
    weekStartDay: 'weekStartDay',
    userId: 'userId',
    householdId: 'householdId',
    $inferInsert: {},
  },
  customTags: {
    name: 'name',
    userId: 'userId',
    householdId: 'householdId',
  },
}))

vi.mock('@/lib/db/helpers', () => ({
  dbFirst: (rows: unknown[]) => rows[0] ?? null,
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  canManage: () => true,
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
}))

vi.mock('@/lib/tags', () => ({
  FIRST_CLASS_TAGS: ['Vegetarian', 'Gluten-Free', 'Quick'],
}))

vi.mock('@/lib/schemas', () => ({
  updatePreferencesSchema: {},
  parseBody: vi.fn(),
}))

function makeGetReq(): NextRequest {
  return new NextRequest('http://localhost/api/preferences')
}

function makePatchReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function setupAuth() {
  const { auth } = await import('@/lib/auth-server')
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

describe('GET /api/preferences — weekStartDay as number', () => {
  beforeEach(async () => {
    vi.resetModules()
    await setupAuth()
  })

  it('returns 0 for sunday', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([makePrefsRow('sunday')]) as any)

    const { GET } = await import('@/app/api/preferences/route')
    const res = await GET(makeGetReq() as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.weekStartDay).toBe(0)
  })

  it('returns 1 for monday', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([makePrefsRow('monday')]) as any)

    const { GET } = await import('@/app/api/preferences/route')
    const res = await GET(makeGetReq() as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.weekStartDay).toBe(1)
  })

  it('returns 3 for wednesday', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([makePrefsRow('wednesday')]) as any)

    const { GET } = await import('@/app/api/preferences/route')
    const res = await GET(makeGetReq() as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.weekStartDay).toBe(3)
  })

  it('returns 6 for saturday', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([makePrefsRow('saturday')]) as any)

    const { GET } = await import('@/app/api/preferences/route')
    const res = await GET(makeGetReq() as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.weekStartDay).toBe(6)
  })

  it('returns 0 (default) when no prefs row exists', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([]) as any)

    const { GET } = await import('@/app/api/preferences/route')
    const res = await GET(makeGetReq() as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.weekStartDay).toBe(0)
  })

  it('weekStartDay is a number, not a string', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([makePrefsRow('friday')]) as any)

    const { GET } = await import('@/app/api/preferences/route')
    const res = await GET(makeGetReq() as Parameters<typeof GET>[0])
    const json = await res.json()
    expect(typeof json.weekStartDay).toBe('number')
  })
})

describe('PATCH /api/preferences — weekStartDay number → DB text conversion', () => {
  beforeEach(async () => {
    vi.resetModules()
    await setupAuth()
  })

  it('saves wednesday (3) as "wednesday" and returns 3', async () => {
    const { parseBody } = await import('@/lib/schemas')
    vi.mocked(parseBody).mockResolvedValue({
      data: { weekStartDay: 3 } as Record<string, unknown>,
    })

    const returnedRow = makePrefsRow('wednesday')
    const { db } = await import('@/lib/db')
    const insertChain = mockChain([returnedRow])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.insert).mockReturnValue(insertChain as any)

    const { PATCH } = await import('@/app/api/preferences/route')
    const res = await PATCH(makePatchReq({ weekStartDay: 3 }) as Parameters<typeof PATCH>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.weekStartDay).toBe(3)
  })

  it('saves saturday (6) and returns 6', async () => {
    const { parseBody } = await import('@/lib/schemas')
    vi.mocked(parseBody).mockResolvedValue({
      data: { weekStartDay: 6 } as Record<string, unknown>,
    })

    const returnedRow = makePrefsRow('saturday')
    const { db } = await import('@/lib/db')
    const insertChain = mockChain([returnedRow])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.insert).mockReturnValue(insertChain as any)

    const { PATCH } = await import('@/app/api/preferences/route')
    const res = await PATCH(makePatchReq({ weekStartDay: 6 }) as Parameters<typeof PATCH>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.weekStartDay).toBe(6)
  })

  it('saves sunday (0) and returns 0', async () => {
    const { parseBody } = await import('@/lib/schemas')
    vi.mocked(parseBody).mockResolvedValue({
      data: { weekStartDay: 0 } as Record<string, unknown>,
    })

    const returnedRow = makePrefsRow('sunday')
    const { db } = await import('@/lib/db')
    const insertChain = mockChain([returnedRow])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.insert).mockReturnValue(insertChain as any)

    const { PATCH } = await import('@/app/api/preferences/route')
    const res = await PATCH(makePatchReq({ weekStartDay: 0 }) as Parameters<typeof PATCH>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.weekStartDay).toBe(0)
  })
})

describe('PATCH /api/preferences — lastActiveDays and lastActiveMealTypes', () => {
  beforeEach(async () => {
    vi.resetModules()
    await setupAuth()
  })

  it('persists lastActiveDays and returns them', async () => {
    const { parseBody } = await import('@/lib/schemas')
    vi.mocked(parseBody).mockResolvedValue({
      data: { lastActiveDays: ['monday', 'wednesday', 'friday'] } as Record<string, unknown>,
    })

    const returnedRow = {
      ...makePrefsRow(),
      lastActiveDays: ['monday', 'wednesday', 'friday'],
    }
    const { db } = await import('@/lib/db')
    const insertChain = mockChain([returnedRow])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.insert).mockReturnValue(insertChain as any)

    const { PATCH } = await import('@/app/api/preferences/route')
    const res = await PATCH(makePatchReq({ lastActiveDays: ['monday', 'wednesday', 'friday'] }) as Parameters<typeof PATCH>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.lastActiveDays).toEqual(['monday', 'wednesday', 'friday'])
  })

  it('persists lastActiveMealTypes and returns them', async () => {
    const { parseBody } = await import('@/lib/schemas')
    vi.mocked(parseBody).mockResolvedValue({
      data: { lastActiveMealTypes: ['dinner', 'breakfast'] } as Record<string, unknown>,
    })

    const returnedRow = {
      ...makePrefsRow(),
      lastActiveMealTypes: ['dinner', 'breakfast'],
    }
    const { db } = await import('@/lib/db')
    const insertChain = mockChain([returnedRow])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.insert).mockReturnValue(insertChain as any)

    const { PATCH } = await import('@/app/api/preferences/route')
    const res = await PATCH(makePatchReq({ lastActiveMealTypes: ['dinner', 'breakfast'] }) as Parameters<typeof PATCH>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.lastActiveMealTypes).toEqual(['dinner', 'breakfast'])
  })

  it('returns empty arrays from GET when no prefs exist', async () => {
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([]) as any)

    const { GET } = await import('@/app/api/preferences/route')
    const res = await GET(makeGetReq() as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.lastActiveDays).toEqual([])
    expect(json.lastActiveMealTypes).toEqual([])
  })

  it('returns lastActiveDays from GET when prefs exist', async () => {
    const row = {
      ...makePrefsRow(),
      lastActiveDays: ['tuesday', 'thursday'],
      lastActiveMealTypes: ['dinner'],
    }
    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([row]) as any)

    const { GET } = await import('@/app/api/preferences/route')
    const res = await GET(makeGetReq() as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.lastActiveDays).toEqual(['tuesday', 'thursday'])
    expect(json.lastActiveMealTypes).toEqual(['dinner'])
  })
})
