import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock state ────────────────────────────────────────────────────────────────
const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  plan: null as { id: string; week_start: string } | null,
  entries: [] as unknown[],
  history: [] as unknown[],
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
      if (table === 'meal_plans') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: mockState.plan, error: mockState.plan ? null : { message: 'not found' } }),
              }),
            }),
          }),
        }
      }
      if (table === 'meal_plan_entries') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: async () => ({ data: mockState.entries, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'recipe_history') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: mockState.history, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    },
  }),
}))

const { GET } = await import('@/app/api/home/route')

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/home', {
    headers: { Authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  mockState.user = { id: 'user-1' }
  mockState.plan = null
  mockState.entries = []
  mockState.history = []
})

// ── T07: /home shows current week plan when one exists ───────────────────────
describe('T07 - GET /api/home returns current week plan', () => {
  it('returns currentWeekPlan with entries when a plan exists', async () => {
    mockState.plan = { id: 'plan-1', week_start: '2026-03-02' }
    mockState.entries = [
      { planned_date: '2026-03-02', recipe_id: 'r1', position: 1, confirmed: false, recipes: { title: 'Pasta' } },
    ]
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.currentWeekPlan).not.toBeNull()
    expect(body.currentWeekPlan.entries).toHaveLength(1)
    expect(body.currentWeekPlan.entries[0].recipe_title).toBe('Pasta')
  })
})

// ── T08: /home shows null plan when no plan exists ───────────────────────────
describe('T08 - GET /api/home returns null plan when none exists', () => {
  it('returns currentWeekPlan=null when no plan for current week', async () => {
    mockState.plan = null
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.currentWeekPlan).toBeNull()
  })
})

// ── T09: /home shows last 3 recently made recipes ────────────────────────────
describe('T09 - GET /api/home returns recently made recipes', () => {
  it('returns up to 3 recently made recipes', async () => {
    mockState.history = [
      { recipe_id: 'r1', made_on: '2026-03-01', recipes: { title: 'Tacos' } },
      { recipe_id: 'r2', made_on: '2026-02-28', recipes: { title: 'Soup' } },
      { recipe_id: 'r3', made_on: '2026-02-27', recipes: { title: 'Pizza' } },
    ]
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.recentlyMade).toHaveLength(3)
    expect(body.recentlyMade[0].recipe_title).toBe('Tacos')
    expect(body.recentlyMade[2].recipe_title).toBe('Pizza')
  })
})

// ── T10: /home returns empty array when no history ───────────────────────────
describe('T10 - GET /api/home returns empty recentlyMade when no history', () => {
  it('returns empty recentlyMade array when no history', async () => {
    mockState.history = []
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.recentlyMade).toHaveLength(0)
  })
})

describe('GET /api/home - unauthenticated', () => {
  it('returns 401 when not authenticated', async () => {
    mockState.user = null
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })
})
