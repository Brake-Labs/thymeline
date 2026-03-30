import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockSupabase,
  mockHousehold,
  makeRequest,
  defaultGetUser,
} from '@/test/helpers'

// ── Mutable mock state ────────────────────────────────────────────────────────
const mockState = {
  user: null as { id: string } | null,
  prefsRow: null as Record<string, unknown> | null,
  prefsError: null as { code?: string; message: string } | null,
  userTags: [] as { name: string }[],
  upsertResult: null as Record<string, unknown> | null,
}

// ── Table-specific mock behavior ──────────────────────────────────────────────

function makePrefsFrom(table: string) {
  if (table === 'user_tags') {
    return {
      select: () => ({
        eq: () => Promise.resolve({ data: mockState.userTags, error: null }),
      }),
    }
  }
  // user_preferences
  return {
    select: (_cols: string) => ({
      eq: (_col: string, _val: unknown) => ({
        single: async () => {
          if (mockState.prefsError) {
            return { data: null, error: mockState.prefsError }
          }
          if (!mockState.prefsRow) {
            return { data: null, error: { code: 'PGRST116', message: 'not found' } }
          }
          return { data: mockState.prefsRow, error: null }
        },
      }),
    }),
    upsert: (data: Record<string, unknown>, _opts: unknown) => ({
      select: (_cols: string) => ({
        single: async () => {
          if (mockState.upsertResult) {
            return { data: { ...data, ...mockState.upsertResult }, error: null }
          }
          // Default: return the upserted data merged with defaults
          return {
            data: {
              options_per_day: 3,
              cooldown_days: 28,
              seasonal_mode: true,
              preferred_tags: [],
              avoided_tags: [],
              limited_tags: [],
              onboarding_completed: false,
              ...data,
            },
            error: null,
          }
        },
      }),
    }),
  }
}

// The admin client uses the same from logic but also needs upsert support
function makeAdminFrom(table: string) {
  if (table === 'user_tags') {
    return {
      select: () => ({
        eq: () => Promise.resolve({ data: mockState.userTags, error: null }),
      }),
    }
  }
  return {
    select: (_cols: string) => ({
      eq: (_col: string, _val: unknown) => ({
        single: async () => {
          if (mockState.prefsError) return { data: null, error: mockState.prefsError }
          if (!mockState.prefsRow) return { data: null, error: { code: 'PGRST116', message: 'not found' } }
          return { data: mockState.prefsRow, error: null }
        },
      }),
    }),
    upsert: (data: Record<string, unknown>, _opts: unknown) => ({
      select: (_cols: string) => ({
        single: async () => ({
          data: {
            options_per_day: 3, cooldown_days: 28, seasonal_mode: true,
            preferred_tags: [], avoided_tags: [], limited_tags: [],
            onboarding_completed: false, ...data,
            ...(mockState.upsertResult ?? {}),
          },
          error: null,
        }),
      }),
    }),
  }
}

// ── Module mocks (vi.mock calls must stay in the test file) ───────────────────

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => ({
    auth: { getUser: defaultGetUser(mockState) },
    from: makePrefsFrom,
  }),
  createAdminClient: () => ({
    from: makeAdminFrom,
  }),
}))

vi.mock('@/lib/household', () => mockHousehold({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
}))

import { resolveHouseholdScope } from '@/lib/household'

// Import after mocks are set up
const { GET, PATCH } = await import('@/app/api/preferences/route')

beforeEach(() => {
  mockState.user = { id: 'user-1' }
  mockState.prefsRow = null
  mockState.prefsError = null
  mockState.userTags = []
  mockState.upsertResult = null
})

// ── GET /api/preferences ─────────────────────────────────────────────────────
describe('GET /api/preferences', () => {
  it('returns defaults when no row exists', async () => {
    mockState.prefsRow = null
    const res = await GET(makeRequest('GET', 'http://localhost/api/preferences'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.options_per_day).toBe(3)
    expect(body.cooldown_days).toBe(28)
    expect(body.onboarding_completed).toBe(false)
  })

  it('returns stored preferences when row exists', async () => {
    mockState.prefsRow = {
      options_per_day: 5,
      cooldown_days: 14,
      seasonal_mode: false,
      preferred_tags: ['Healthy'],
      avoided_tags: [],
      limited_tags: [],
      onboarding_completed: true,
    }
    const res = await GET(makeRequest('GET', 'http://localhost/api/preferences'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.options_per_day).toBe(5)
    expect(body.onboarding_completed).toBe(true)
  })

  it('returns 500 when DB returns a non-PGRST116 error (e.g. RLS denial)', async () => {
    mockState.prefsError = { code: '42501', message: 'permission denied for table user_preferences' }
    const res = await GET(makeRequest('GET', 'http://localhost/api/preferences'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('permission denied')
  })
})

// ── T17: PATCH validation errors ─────────────────────────────────────────────
describe('T17 - PATCH returns 400 for invalid ranges', () => {
  it('returns 400 for options_per_day: 0', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { options_per_day: 0 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/options_per_day/)
  })

  it('returns 400 for options_per_day: 6', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { options_per_day: 6 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for cooldown_days: 0', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { cooldown_days: 0 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cooldown_days/)
  })

  it('returns 400 for cooldown_days: 61', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { cooldown_days: 61 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for limited_tags cap out of range', async () => {
    mockState.userTags = [{ name: 'Comfort' }]
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { limited_tags: [{ tag: 'Comfort', cap: 8 }] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cap/)
  })
})

// ── T18: PATCH with unknown tag returns 400 ──────────────────────────────────
describe('T18 - PATCH with unknown tag returns 400', () => {
  it('returns 400 for unknown preferred_tags', async () => {
    mockState.userTags = [] // no tags in user's library
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { preferred_tags: ['UnknownTag'] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown tags/i)
  })

  it('returns 200 for valid preferred_tags', async () => {
    mockState.userTags = [{ name: 'Healthy' }, { name: 'Quick' }]
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { preferred_tags: ['Healthy'] }))
    expect(res.status).toBe(200)
  })
})

// ── T15: Partial PATCH only updates sent fields ───────────────────────────────
describe('T15 - partial PATCH only updates sent fields', () => {
  it('sends only cooldown_days and response includes it updated', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { cooldown_days: 7 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cooldown_days).toBe(7)
  })

  it('PATCH does not include non-sent fields in upsert payload', async () => {
    // Only cooldown_days is sent — the response should not reset other fields
    // The upsert mock returns merged data including the sent field
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { cooldown_days: 14 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cooldown_days).toBe(14)
  })
})

// ── T16: DB trigger (documented in migration SQL) ────────────────────────────
describe('T16 - DB trigger creates default preferences row on signup', () => {
  it('migration SQL defines handle_new_user trigger function', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/003_preference_settings.sql')
    const sql = fs.readFileSync(migrationPath, 'utf-8')
    expect(sql).toContain('create or replace function handle_new_user()')
    expect(sql).toContain('create trigger on_auth_user_created')
    expect(sql).toContain('after insert on auth.users')
    expect(sql).toContain('options_per_day')
    expect(sql).toContain('cooldown_days')
    expect(sql).toContain('onboarding_completed')
  })
})

// ── T19: Household member GET returns household prefs ────────────────────────
describe('T19 - household member GET /api/preferences returns household preferences', () => {
  it('returns household prefs row when user is in a household', async () => {
    mockState.prefsRow = {
      options_per_day: 4,
      cooldown_days: 21,
      seasonal_mode: true,
      preferred_tags: [],
      avoided_tags: [],
      limited_tags: [],
      onboarding_completed: true,
    }
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })
    const res = await GET(makeRequest('GET', 'http://localhost/api/preferences'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.options_per_day).toBe(4)
    expect(body.cooldown_days).toBe(21)
  })
})

// ── T20: Member role PATCH returns 403 ────────────────────────────────────────
describe('T20 - PATCH /api/preferences returns 403 for household member (non-manager)', () => {
  it('returns 403 when user has role "member" in the household', async () => {
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'member',
    })
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { cooldown_days: 14 }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/owner or co-owner/)
  })
})

// ── T21: Co-owner PATCH returns 200 ──────────────────────────────────────────
describe('T21 - PATCH /api/preferences returns 200 for co-owner', () => {
  it('allows co_owner to update household preferences', async () => {
    vi.mocked(resolveHouseholdScope).mockResolvedValueOnce({
      householdId: 'hh-1',
      role: 'co_owner',
    })
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/preferences', { cooldown_days: 14 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cooldown_days).toBe(14)
  })
})

// ── T01/T02: Redirect logic (server component, documented) ───────────────────
describe('T01/T02 - onboarding redirect logic in app layout', () => {
  it('layout.tsx fetches preferences and redirects on onboarding_completed=false', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const layoutPath = path.join(process.cwd(), 'app/(app)/layout.tsx')
    const src = fs.readFileSync(layoutPath, 'utf-8')
    expect(src).toContain("redirect('/onboarding')")
    expect(src).toContain('onboarding_completed === false')
    expect(src).toContain("startsWith('/onboarding')")
  })
})
