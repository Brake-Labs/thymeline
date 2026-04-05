import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock state ─────────────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  plan: null as { id: string; week_start: string } | null,
  entry: null as { id: string; user_id: string } | null,
  entryError: null as { message: string } | null,
  parentEntryMealType: null as string | null,  // for dessert parent validation
}

function makeMockFrom(table: string) {
  if (table === 'meal_plans') {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockState.plan, error: null }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: { id: 'new-plan-1' },
            error: null,
          }),
        }),
      }),
    }
  }
  if (table === 'meal_plan_entries') {
    return {
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: mockState.entryError ? null : {
              id: 'entry-1',
              recipe_id: 'r1',
              planned_date: '2026-03-01',
              position: 1,
              confirmed: true,
              meal_type: 'dinner',
              is_side_dish: false,
              parent_entry_id: null,
              recipes: { title: 'Pasta' },
            },
            error: mockState.entryError,
          }),
        }),
      }),
      select: (cols?: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            if (cols === 'meal_type') {
              // dessert parent validation lookup
              return {
                data: mockState.parentEntryMealType !== null
                  ? { meal_type: mockState.parentEntryMealType }
                  : null,
                error: null,
              }
            }
            // ownership check (DELETE route)
            return {
              data: mockState.entry
                ? { id: mockState.entry.id, meal_plan_id: 'plan-1', meal_plans: { user_id: mockState.entry.user_id } }
                : null,
              error: null,
            }
          },
        }),
      }),
      delete: () => ({
        eq: async () => ({ error: null }),
      }),
    }
  }
  return {}
}

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
  createAdminClient: () => ({ from: makeMockFrom }),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: async () => null,
  canManage: (role: string) => role === 'owner' || role === 'co_owner',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scopeQuery: (query: any, userId: string, ctx: any) => {
    if (ctx) return query.eq('household_id', ctx.householdId)
    return query.eq('user_id', userId)
  },
}))

const { POST: entriesPOST } = await import('@/app/api/plan/entries/route')
const { DELETE: entryDELETE } = await import('@/app/api/plan/entries/[entry_id]/route')

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  const opts: ConstructorParameters<typeof NextRequest>[1] = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
  }
  if (body) opts!.body = JSON.stringify(body)
  return new NextRequest(url, opts)
}

function makeDeleteReq(entryId: string): [NextRequest, { params: { entry_id: string } }] {
  return [
    makeReq('DELETE', `http://localhost/api/plan/entries/${entryId}`),
    { params: { entry_id: entryId } },
  ]
}

beforeEach(() => {
  mockState.user = { id: 'user-1' }
  mockState.plan = null
  mockState.entry = null
  mockState.entryError = null
  mockState.parentEntryMealType = null
})

// ── T17: POST /api/plan/entries — side dish + breakfast returns 400 ────────────

describe('T17 - POST /api/plan/entries with is_side_dish=true and meal_type=breakfast returns 400', () => {
  it('returns 400 when side dish is for a breakfast slot', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-01',
      recipe_id: 'r1',
      meal_type: 'breakfast',
      is_side_dish: true,
      parent_entry_id: 'parent-1',
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Side dishes are only allowed')
  })

  it('returns 400 when side dish is for a snack slot', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-01',
      recipe_id: 'r1',
      meal_type: 'snack',
      is_side_dish: true,
      parent_entry_id: 'parent-1',
    }))
    expect(res.status).toBe(400)
  })

  it('allows side dish for dinner slot', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-01',
      recipe_id: 'r1',
      meal_type: 'dinner',
      is_side_dish: true,
      parent_entry_id: 'parent-1',
    }))
    expect(res.status).toBe(201)
  })
})

// ── T18: POST /api/plan/entries — side dish without parent_entry_id returns 400 ─

describe('T18 - POST /api/plan/entries with is_side_dish=true and no parent_entry_id returns 400', () => {
  it('returns 400 when parent_entry_id is missing for side dish', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-01',
      recipe_id: 'r1',
      meal_type: 'dinner',
      is_side_dish: true,
      // parent_entry_id omitted
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('parent_entry_id')
  })
})

// ── T15: DELETE /api/plan/entries/[id] — 403 for non-owner ────────────────────

describe('T15 - DELETE /api/plan/entries/[id] returns 403 for non-owner', () => {
  it('returns 403 when the entry belongs to another user', async () => {
    mockState.entry = { id: 'entry-1', user_id: 'other-user' }
    const [req, ctx] = makeDeleteReq('entry-1')
    const res = await entryDELETE(req, ctx)
    expect(res.status).toBe(403)
  })

  it('returns 204 for the owner', async () => {
    mockState.entry = { id: 'entry-1', user_id: 'user-1' }
    const [req, ctx] = makeDeleteReq('entry-1')
    const res = await entryDELETE(req, ctx)
    expect(res.status).toBe(204)
  })

  it('returns 404 when entry does not exist', async () => {
    mockState.entry = null
    const [req, ctx] = makeDeleteReq('nonexistent')
    const res = await entryDELETE(req, ctx)
    expect(res.status).toBe(404)
  })
})

// ── POST /api/plan/entries — basic creation ────────────────────────────────────

describe('POST /api/plan/entries - creates entry', () => {
  it('returns 201 with the created entry', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-01',
      recipe_id: 'r1',
      meal_type: 'dinner',
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.meal_type).toBe('dinner')
    expect(body.recipe_id).toBe('r1')
  })

  it('returns 400 when date is outside week', async () => {
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-10', // outside the week
      recipe_id: 'r1',
      meal_type: 'dinner',
    }))
    expect(res.status).toBe(400)
  })

})

// ── Dessert entry tests ────────────────────────────────────────────────────────

describe('Dessert entries — meal_type=dessert', () => {
  it('saves with correct meal_type when parent is a dinner slot', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    mockState.parentEntryMealType = 'dinner'
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-01',
      recipe_id: 'r1',
      meal_type: 'dessert',
      parent_entry_id: 'parent-1',
    }))
    expect(res.status).toBe(201)
  })

  it('saves with correct meal_type when parent is a lunch slot', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    mockState.parentEntryMealType = 'lunch'
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-01',
      recipe_id: 'r1',
      meal_type: 'dessert',
      parent_entry_id: 'parent-1',
    }))
    expect(res.status).toBe(201)
  })

  it('returns 400 when attached to a breakfast parent slot', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    mockState.parentEntryMealType = 'breakfast'
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-01',
      recipe_id: 'r1',
      meal_type: 'dessert',
      parent_entry_id: 'parent-1',
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Dinner and Lunch')
  })

  it('returns 400 when attached to a snack parent slot', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    mockState.parentEntryMealType = 'snack'
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-01',
      recipe_id: 'r1',
      meal_type: 'dessert',
      parent_entry_id: 'parent-1',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when parent_entry_id is missing', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-01' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-01',
      date: '2026-03-01',
      recipe_id: 'r1',
      meal_type: 'dessert',
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('parent_entry_id')
  })
})

// ── Monday week_start — isSunday guard removed ────────────────────────────────

describe('POST /api/plan/entries — Monday week_start accepted', () => {
  it('does not return 400 for a Monday week_start', async () => {
    // 2026-03-30 is a Monday
    mockState.plan = { id: 'plan-1', week_start: '2026-03-30' }
    const res = await entriesPOST(makeReq('POST', 'http://localhost/api/plan/entries', {
      week_start: '2026-03-30',
      date: '2026-03-30',
      recipe_id: 'r1',
      meal_type: 'dinner',
    }))
    expect(res.status).not.toBe(400)
  })
})
