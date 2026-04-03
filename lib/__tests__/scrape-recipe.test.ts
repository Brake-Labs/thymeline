/**
 * Regression tests for scrapeRecipe
 * Covers: rate-limit error propagation, content limit
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

// 25000-char content — long enough to exercise both slice boundaries
const PAGE_CONTENT = 'A'.repeat(25000)

vi.mock('firecrawl', () => ({
  default: class MockFirecrawl {
    async scrape() { return { markdown: PAGE_CONTENT } }
  },
}))

const mockCallLLM = vi.fn()

vi.mock('@/lib/llm', () => {
  class LLMError extends Error {
    code: string
    cause?: unknown
    constructor(message: string, code: string, cause?: unknown) {
      super(message)
      this.name = 'LLMError'
      this.code = code
      this.cause = cause
    }
  }
  return {
    callLLM:       mockCallLLM,
    LLM_MODEL_FAST: 'test-model',
    LLMError,
  }
})

vi.mock('@/lib/household', () => ({
  scopeQuery: vi.fn((q: unknown) => q),
}))

vi.mock('@/lib/tags', () => ({
  FIRST_CLASS_TAGS: ['Quick', 'Vegetarian'],
}))

const mockDb = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockResolvedValue({ data: [], error: null }),
  })),
}

const GOOD_LLM_RESPONSE = JSON.stringify({
  title: 'Test Recipe', ingredients: 'x', steps: 'y',
  imageUrl: null, suggestedTags: [], suggestedNewTags: [],
  servings: null, prepTimeMinutes: 10, cookTimeMinutes: 20,
  totalTimeMinutes: 30, inactiveTimeMinutes: null, stepPhotos: [],
  category: 'main_dish',
})

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  vi.stubEnv('FIRECRAWL_API_KEY', 'test-key')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

// ── Category extraction tests ─────────────────────────────────────────────────

describe('scrapeRecipe category extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the category from LLM response when valid', async () => {
    mockCallLLM.mockResolvedValue(JSON.stringify({
      title: 'Pancakes', ingredients: 'x', steps: 'y',
      imageUrl: null, suggestedTags: [], suggestedNewTags: [],
      servings: null, prepTimeMinutes: 5, cookTimeMinutes: 10,
      totalTimeMinutes: 15, inactiveTimeMinutes: null, stepPhotos: [],
      category: 'breakfast',
    }))
    const { scrapeRecipe } = await import('@/lib/scrape-recipe')
    const result = await scrapeRecipe('https://example.com', 'user-1', mockDb as never, null)
    expect('category' in result && result.category).toBe('breakfast')
  })

  it('includes category field in the LLM prompt', async () => {
    mockCallLLM.mockResolvedValue(GOOD_LLM_RESPONSE)
    const { scrapeRecipe } = await import('@/lib/scrape-recipe')
    await scrapeRecipe('https://example.com', 'user-1', mockDb as never, null)
    const prompt: string = mockCallLLM.mock.calls[0]?.[0]?.user ?? ''
    expect(prompt).toContain('"category"')
    expect(prompt).toContain('main_dish')
    expect(prompt).toContain('breakfast')
    expect(prompt).toContain('dessert')
    expect(prompt).toContain('side_dish')
  })

  it('falls back to null for an invalid category value', async () => {
    mockCallLLM.mockResolvedValue(JSON.stringify({
      title: 'Soup', ingredients: 'x', steps: 'y',
      imageUrl: null, suggestedTags: [], suggestedNewTags: [],
      servings: null, prepTimeMinutes: 10, cookTimeMinutes: 20,
      totalTimeMinutes: 30, inactiveTimeMinutes: null, stepPhotos: [],
      category: 'soup',  // not a valid value
    }))
    const { scrapeRecipe } = await import('@/lib/scrape-recipe')
    const result = await scrapeRecipe('https://example.com', 'user-1', mockDb as never, null)
    expect('category' in result && result.category).toBeNull()
  })

  it('falls back to null when category field is missing', async () => {
    mockCallLLM.mockResolvedValue(JSON.stringify({
      title: 'Salad', ingredients: 'x', steps: 'y',
      imageUrl: null, suggestedTags: [], suggestedNewTags: [],
      servings: null, prepTimeMinutes: 10, cookTimeMinutes: 5,
      totalTimeMinutes: 15, inactiveTimeMinutes: null, stepPhotos: [],
      // no category field
    }))
    const { scrapeRecipe } = await import('@/lib/scrape-recipe')
    const result = await scrapeRecipe('https://example.com', 'user-1', mockDb as never, null)
    expect('category' in result && result.category).toBeNull()
  })
})

describe('scrapeRecipe content limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCallLLM.mockResolvedValue(GOOD_LLM_RESPONSE)
  })

  it('sends up to 20000 chars of page content to LLM', async () => {
    const { scrapeRecipe } = await import('@/lib/scrape-recipe')
    await scrapeRecipe('https://example.com', 'user-1', mockDb as never, null)

    const prompt: string = mockCallLLM.mock.calls[0]?.[0]?.user ?? ''
    const contentSection = prompt.split('Page content:\n')[1] ?? ''
    expect(contentSection.length).toBe(20000)
  })
})

describe('scrapeRecipe rate-limit error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('FIRECRAWL_API_KEY', 'test-key')
  })

  it('returns { code: "rate_limit" } when LLM throws a rate limit error', async () => {
    const { LLMError } = await import('@/lib/llm')
    const rateLimitErr = new (LLMError as new (m: string, c: string, cause?: unknown) => InstanceType<typeof LLMError>)(
      'Rate limited', 'rate_limit', { headers: { get: () => '5' } },
    )
    mockCallLLM.mockRejectedValue(rateLimitErr)

    const { scrapeRecipe } = await import('@/lib/scrape-recipe')
    const result = await scrapeRecipe('https://example.com', 'user-1', mockDb as never, null)

    expect(result).toMatchObject({ error: expect.any(String), code: 'rate_limit' })
  })

  it('reads retry-after header and converts to ms', async () => {
    const { LLMError } = await import('@/lib/llm')
    const rateLimitErr = new (LLMError as new (m: string, c: string, cause?: unknown) => InstanceType<typeof LLMError>)(
      'Rate limited', 'rate_limit', { headers: { get: (_k: string) => '30' } }, // 30 seconds
    )
    mockCallLLM.mockRejectedValue(rateLimitErr)

    const { scrapeRecipe } = await import('@/lib/scrape-recipe')
    const result = await scrapeRecipe('https://example.com', 'user-1', mockDb as never, null)

    expect(result).toMatchObject({ code: 'rate_limit', retryAfterMs: 30_000 })
  })

  it('returns undefined retryAfterMs when no retry-after header', async () => {
    const { LLMError } = await import('@/lib/llm')
    const rateLimitErr = new (LLMError as new (m: string, c: string, cause?: unknown) => InstanceType<typeof LLMError>)(
      'Rate limited', 'rate_limit', undefined,
    )
    mockCallLLM.mockRejectedValue(rateLimitErr)

    const { scrapeRecipe } = await import('@/lib/scrape-recipe')
    const result = await scrapeRecipe('https://example.com', 'user-1', mockDb as never, null)

    expect(result).toMatchObject({ code: 'rate_limit' })
    expect((result as { retryAfterMs?: number }).retryAfterMs).toBeUndefined()
  })

  it('non-rate-limit LLM errors continue with partial result (existing behaviour)', async () => {
    mockCallLLM.mockRejectedValue(new Error('Some other error'))

    const { scrapeRecipe } = await import('@/lib/scrape-recipe')
    const result = await scrapeRecipe('https://example.com', 'user-1', mockDb as never, null)

    // Should return a partial ScrapeRecipeResult, not an error object with code
    expect('error' in result ? (result as { code?: string }).code : undefined).toBeUndefined()
    expect('partial' in result).toBe(true)
  })
})
