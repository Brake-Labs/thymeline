/**
 * Regression tests for rate-limit retry logic in scrapeUrl
 * (hotfix/import-scrape-compact-retry — Fix 2)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockScrapeRecipe = vi.fn()

vi.mock('@/lib/scrape-recipe', () => ({
  scrapeRecipe: mockScrapeRecipe,
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}))

vi.mock('@/lib/auth-server', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('@/lib/db/schema', () => ({
  recipes: { id: 'id', userId: 'userId', householdId: 'householdId', title: 'title', url: 'url' },
  customTags: { name: 'name', userId: 'userId' },
}))

vi.mock('@/lib/db/helpers', () => ({
  dbFirst: (rows: unknown[]) => rows[0] ?? null,
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  scopeCondition: vi.fn().mockReturnValue({}),
  scopeInsert: vi.fn((userId: string) => ({ userId })),
  checkOwnership: vi.fn().mockResolvedValue({ owned: true }),
}))

vi.mock('@/lib/import/detect-duplicates', () => ({
  detectDuplicates: vi.fn().mockResolvedValue([undefined]),
}))

const GOOD_SCRAPE: import('@/lib/scrape-recipe').ScrapeRecipeResult = {
  title: 'Retried Recipe', ingredients: 'x', steps: 'y',
  imageUrl: null, sourceUrl: 'https://example.com/recipe', partial: false,
  category: null,
  suggestedTags: [], suggestedNewTags: [], servings: null,
  prepTimeMinutes: null, cookTimeMinutes: null, totalTimeMinutes: null,
  inactiveTimeMinutes: null, stepPhotos: [],
}

const RATE_LIMIT_ERROR = { error: 'Rate limited', code: 'rate_limit', retryAfterMs: 0 }

// ── Tests ─────────────────────────────────────────────────────────────────────

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

describe('scrapeUrl rate-limit retry', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth-server')
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com', name: 'Test', image: null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { db } = await import('@/lib/db')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.select).mockReturnValue(mockChain([]) as any)
  })

  it('retries on rate_limit and succeeds on 3rd attempt', async () => {
    mockScrapeRecipe
      .mockResolvedValueOnce(RATE_LIMIT_ERROR)
      .mockResolvedValueOnce(RATE_LIMIT_ERROR)
      .mockResolvedValueOnce(GOOD_SCRAPE)

    const { POST } = await import('../urls/route')
    const req = new Request('http://localhost/api/import/urls', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ urls: ['https://example.com/recipe'] }),
    })
    const res = await POST(req as never, undefined as never)
    expect(res.status).toBe(202)
    const { job_id } = await res.json() as { job_id: string }

    // Wait for background scraping (retryAfterMs: 0 means no real delay)
    await new Promise((r) => setTimeout(r, 50))

    const { getJob } = await import('@/lib/import-jobs')
    const job = getJob(job_id)
    expect(mockScrapeRecipe).toHaveBeenCalledTimes(3)
    expect(job?.results[0]?.status).toBe('success')
  })

  it('marks as failed after MAX_RETRIES (3) rate_limit responses', async () => {
    mockScrapeRecipe.mockResolvedValue(RATE_LIMIT_ERROR)

    const { POST } = await import('../urls/route')
    const req = new Request('http://localhost/api/import/urls', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ urls: ['https://example.com/recipe'] }),
    })
    const res = await POST(req as never, undefined as never)
    const { job_id } = await res.json() as { job_id: string }

    await new Promise((r) => setTimeout(r, 50))

    const { getJob } = await import('@/lib/import-jobs')
    const job = getJob(job_id)
    expect(mockScrapeRecipe).toHaveBeenCalledTimes(3)
    expect(job?.results[0]?.status).toBe('failed')
  })

  it('does not retry on non-rate-limit errors', async () => {
    mockScrapeRecipe.mockResolvedValue({ error: 'Failed to fetch URL content' })

    const { POST } = await import('../urls/route')
    const req = new Request('http://localhost/api/import/urls', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ urls: ['https://example.com/recipe'] }),
    })
    const res = await POST(req as never, undefined as never)
    const { job_id } = await res.json() as { job_id: string }

    await new Promise((r) => setTimeout(r, 50))

    const { getJob } = await import('@/lib/import-jobs')
    const job = getJob(job_id)
    expect(mockScrapeRecipe).toHaveBeenCalledTimes(1)
    expect(job?.results[0]?.status).toBe('failed')
  })

  it('regression: does not pass compact option to scrapeRecipe (bulk import uses full 20000-char limit)', async () => {
    mockScrapeRecipe.mockResolvedValue(GOOD_SCRAPE)

    const { POST } = await import('../urls/route')
    const req = new Request('http://localhost/api/import/urls', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ urls: ['https://example.com/recipe'] }),
    })
    await POST(req as never, undefined as never)
    await new Promise((r) => setTimeout(r, 50))

    expect(mockScrapeRecipe).toHaveBeenCalledWith(
      'https://example.com/recipe',
      'user-1',
      null,
      null,
    )
  })
})
