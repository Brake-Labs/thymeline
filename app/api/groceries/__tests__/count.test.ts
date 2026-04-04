/**
 * Tests for GET /api/groceries/count
 * Covers spec test cases: T02
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockUser = { id: 'user-1' }

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  canManage: () => true,
  scopeQuery: (query: { eq: (col: string, val: string) => unknown }, userId: string) =>
    query.eq('user_id', userId),
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'

function makeDb(plans: { id: string }[], entries: { recipe_id: string }[]) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'meal_plans') {
        return {
          select: () => ({
            eq: () => ({
              then: (resolve: (v: { data: { id: string }[] }) => void) =>
                Promise.resolve({ data: plans }).then(resolve),
            }),
          }),
        }
      }
      if (table === 'meal_plan_entries') {
        return {
          select: () => ({
            in: () => ({
              gte: () => ({
                lte: () =>
                  Promise.resolve({ data: entries }),
              }),
            }),
          }),
        }
      }
      return {}
    }),
  }
}

function makeReq(dateFrom?: string, dateTo?: string): NextRequest {
  const url = new URL('http://localhost/api/groceries/count')
  if (dateFrom) url.searchParams.set('date_from', dateFrom)
  if (dateTo) url.searchParams.set('date_to', dateTo)
  return new NextRequest(url.toString(), {
    headers: { Authorization: 'Bearer token' },
  })
}

describe('T02 — GET /api/groceries/count', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 400 when date_from is missing', async () => {
    const db = makeDb([], [])
    vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>)
    const { GET } = await import('@/app/api/groceries/count/route')
    const res = await GET(makeReq(undefined, '2026-03-22') as Parameters<typeof GET>[0])
    expect(res.status).toBe(400)
  })

  it('returns 400 when date_to is missing', async () => {
    const db = makeDb([], [])
    vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>)
    const { GET } = await import('@/app/api/groceries/count/route')
    const res = await GET(makeReq('2026-03-15') as Parameters<typeof GET>[0])
    expect(res.status).toBe(400)
  })

  it('returns { recipe_count: 0 } when no meal plans exist', async () => {
    const db = makeDb([], [])
    vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>)
    const { GET } = await import('@/app/api/groceries/count/route')
    const res = await GET(makeReq('2026-03-15', '2026-03-21') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.recipe_count).toBe(0)
  })

  it('returns correct distinct recipe count with entries in range', async () => {
    const db = makeDb(
      [{ id: 'plan-1' }],
      [
        { recipe_id: 'r1' },
        { recipe_id: 'r2' },
        { recipe_id: 'r1' },  // duplicate — should only count once
      ],
    )
    vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>)
    const { GET } = await import('@/app/api/groceries/count/route')
    const res = await GET(makeReq('2026-03-15', '2026-03-21') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.recipe_count).toBe(2)
  })

  it('returns { recipe_count: 0 } when plan has no entries in range', async () => {
    const db = makeDb([{ id: 'plan-1' }], [])
    vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(db as unknown as ReturnType<typeof createAdminClient>)
    const { GET } = await import('@/app/api/groceries/count/route')
    const res = await GET(makeReq('2026-03-15', '2026-03-21') as Parameters<typeof GET>[0])
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.recipe_count).toBe(0)
  })
})
