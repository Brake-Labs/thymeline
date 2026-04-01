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

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createAdminClient:  vi.fn(),
}))

vi.mock('@/lib/household', () => ({
  resolveHouseholdScope: vi.fn().mockResolvedValue(null),
  scopeQuery:            vi.fn((q: { eq: (col: string, val: string) => unknown }) => q.eq('user_id', 'user-1')),
  scopeInsert:           vi.fn((_u: unknown, _c: unknown, p: unknown) => ({ ...(p as object), user_id: 'user-1' })),
  checkOwnership:        vi.fn().mockResolvedValue({ owned: true }),
}))

vi.mock('@/lib/import/detect-duplicates', () => ({
  detectDuplicates: vi.fn().mockResolvedValue([undefined]),
}))

import { createServerClient, createAdminClient } from '@/lib/supabase-server'

const mockUser = { id: 'user-1' }

function makeSupabaseMock() {
  const mock = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  }
  return mock
}

const GOOD_SCRAPE: import('@/lib/scrape-recipe').ScrapeRecipeResult = {
  title: 'Retried Recipe', ingredients: 'x', steps: 'y',
  imageUrl: null, sourceUrl: 'https://example.com/recipe', partial: false,
  suggestedTags: [], suggestedNewTags: [], servings: null,
  prepTimeMinutes: null, cookTimeMinutes: null, totalTimeMinutes: null,
  inactiveTimeMinutes: null, stepPhotos: [],
}

const RATE_LIMIT_ERROR = { error: 'Rate limited', code: 'rate_limit', retryAfterMs: 0 }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('scrapeUrl rate-limit retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mock = makeSupabaseMock()
    vi.mocked(createServerClient).mockReturnValue(mock as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)
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

  it('passes compact: true to scrapeRecipe', async () => {
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
      expect.anything(),
      null,
      { compact: true },
    )
  })
})
