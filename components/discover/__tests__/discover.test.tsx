// @vitest-environment jsdom
/**
 * Tests for discover UI components
 * Covers spec-16 test cases: T01, T02, T08, T09, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { DiscoveryResult } from '@/types'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'mock-token' } } }),
    },
  }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/discover',
  useRouter:   () => ({ push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'mock-token' } } }),
      signOut:    async () => ({}),
    },
  }),
}))

// ── Fixtures ───────────────────────────────────────────────────────────────────

const sampleResult: DiscoveryResult = {
  title:          'Easy Chicken Stir Fry',
  url:            'https://budgetbytes.com/recipes/chicken-stir-fry',
  site_name:      'budgetbytes.com',
  description:    'A quick weeknight dinner.',
  suggested_tags: ['Chicken', 'Quick'],
}

const resultWithExactMatch: DiscoveryResult = {
  ...sampleResult,
  vault_match: {
    similar_recipe_title: 'Chicken Stir Fry',
    similarity: 'exact',
  },
}

const resultWithSimilarMatch: DiscoveryResult = {
  ...sampleResult,
  vault_match: {
    similar_recipe_title: 'My Stir Fry',
    similarity: 'similar',
  },
}

const getToken = async () => 'mock-token'

// ── DiscoverySearch ────────────────────────────────────────────────────────────

describe('T01 — /discover renders search input and example chips', () => {
  it('renders the page title and subtitle', async () => {
    const { default: DiscoverySearch } = await import('../DiscoverySearch')
    render(
      <DiscoverySearch
        query=""
        siteFilter=""
        isLoading={false}
        onQueryChange={vi.fn()}
        onSiteChange={vi.fn()}
        onSubmit={vi.fn()}
        onChipSelect={vi.fn()}
      />
    )
    expect(screen.getByText('Discover Recipes')).toBeInTheDocument()
    expect(screen.getByText('Find new recipes from across the web')).toBeInTheDocument()
  })

  it('renders example chips when query is empty', async () => {
    const { default: DiscoverySearch } = await import('../DiscoverySearch')
    render(
      <DiscoverySearch
        query=""
        siteFilter=""
        isLoading={false}
        onQueryChange={vi.fn()}
        onSiteChange={vi.fn()}
        onSubmit={vi.fn()}
        onChipSelect={vi.fn()}
      />
    )
    expect(screen.getByText('Simple sourdough recipes')).toBeInTheDocument()
    expect(screen.getByText('New slow cooker dinners')).toBeInTheDocument()
    expect(screen.getByText('Healthy weeknight meals')).toBeInTheDocument()
    expect(screen.getByText("Desserts I haven't tried")).toBeInTheDocument()
  })

  it('hides example chips when query is non-empty', async () => {
    const { default: DiscoverySearch } = await import('../DiscoverySearch')
    render(
      <DiscoverySearch
        query="pasta"
        siteFilter=""
        isLoading={false}
        onQueryChange={vi.fn()}
        onSiteChange={vi.fn()}
        onSubmit={vi.fn()}
        onChipSelect={vi.fn()}
      />
    )
    expect(screen.queryByText('Simple sourdough recipes')).not.toBeInTheDocument()
  })
})

describe('T02 — submitting empty query does not call onSubmit', () => {
  it('Discover button is disabled when query is empty', async () => {
    const { default: DiscoverySearch } = await import('../DiscoverySearch')
    const onSubmit = vi.fn()
    render(
      <DiscoverySearch
        query=""
        siteFilter=""
        isLoading={false}
        onQueryChange={vi.fn()}
        onSiteChange={vi.fn()}
        onSubmit={onSubmit}
        onChipSelect={vi.fn()}
      />
    )
    const discoverBtn = screen.getByRole('button', { name: /discover/i })
    expect(discoverBtn).toBeDisabled()
    fireEvent.click(discoverBtn)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('T21 — example chips set query and submit', () => {
  it('clicking a chip calls onChipSelect with the chip text', async () => {
    const { default: DiscoverySearch } = await import('../DiscoverySearch')
    const onChipSelect = vi.fn()
    render(
      <DiscoverySearch
        query=""
        siteFilter=""
        isLoading={false}
        onQueryChange={vi.fn()}
        onSiteChange={vi.fn()}
        onSubmit={vi.fn()}
        onChipSelect={onChipSelect}
      />
    )
    fireEvent.click(screen.getByText('Simple sourdough recipes'))
    expect(onChipSelect).toHaveBeenCalledWith('Simple sourdough recipes')
  })
})

// ── DiscoveryCard ──────────────────────────────────────────────────────────────

describe('T09 — DiscoveryCard renders title, site name, description, tags', () => {
  it('renders all core fields', async () => {
    const { default: DiscoveryCard } = await import('../DiscoveryCard')
    render(
      <DiscoveryCard
        result={sampleResult}
        saved={false}
        onPreview={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText('Easy Chicken Stir Fry')).toBeInTheDocument()
    expect(screen.getByText('budgetbytes.com')).toBeInTheDocument()
    expect(screen.getByText('A quick weeknight dinner.')).toBeInTheDocument()
    expect(screen.getByText('Chicken')).toBeInTheDocument()
    expect(screen.getByText('Quick')).toBeInTheDocument()
  })
})

describe('T10 — "Already saved" badge when vault_match.similarity === "exact"', () => {
  it('renders "Already saved" badge for exact match', async () => {
    const { default: DiscoveryCard } = await import('../DiscoveryCard')
    render(
      <DiscoveryCard
        result={resultWithExactMatch}
        saved={false}
        onPreview={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText('Already saved')).toBeInTheDocument()
  })

  it('renders "Similar to..." badge for similar match', async () => {
    const { default: DiscoveryCard } = await import('../DiscoveryCard')
    render(
      <DiscoveryCard
        result={resultWithSimilarMatch}
        saved={false}
        onPreview={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByText(/Similar to My Stir Fry/)).toBeInTheDocument()
  })
})

describe('T11 — "Preview & Save" opens PreviewSheet', () => {
  it('calls onPreview with the result when button clicked', async () => {
    const { default: DiscoveryCard } = await import('../DiscoveryCard')
    const onPreview = vi.fn()
    render(
      <DiscoveryCard
        result={sampleResult}
        saved={false}
        onPreview={onPreview}
        onDismiss={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /preview.*save/i }))
    expect(onPreview).toHaveBeenCalledWith(sampleResult)
  })
})

describe('T20 — Dismiss removes card from results grid', () => {
  it('calls onDismiss with the result URL', async () => {
    const { default: DiscoveryCard } = await import('../DiscoveryCard')
    const onDismiss = vi.fn()
    render(
      <DiscoveryCard
        result={sampleResult}
        saved={false}
        onPreview={vi.fn()}
        onDismiss={onDismiss}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledWith(sampleResult.url)
  })
})

// ── DiscoveryResults ───────────────────────────────────────────────────────────

describe('T08 — no results for site filter shows "try all sites" prompt', () => {
  it('renders the no-results-for-site message when status=done, results empty, siteFilter set', async () => {
    const { default: DiscoveryResults } = await import('../DiscoveryResults')
    render(
      <DiscoveryResults
        results={[]}
        dismissedUrls={new Set()}
        status="done"
        siteFilter="budgetbytes.com"
        onDismiss={vi.fn()}
        onClearSiteFilter={vi.fn()}
        getToken={getToken}
        onSaved={vi.fn()}
        onEditBeforeSaving={vi.fn()}
      />
    )
    expect(screen.getByText(/No results found on budgetbytes.com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search all sites/i })).toBeInTheDocument()
  })

  it('calls onClearSiteFilter when "Search all sites" is clicked', async () => {
    const { default: DiscoveryResults } = await import('../DiscoveryResults')
    const onClearSiteFilter = vi.fn()
    render(
      <DiscoveryResults
        results={[]}
        dismissedUrls={new Set()}
        status="done"
        siteFilter="budgetbytes.com"
        onDismiss={vi.fn()}
        onClearSiteFilter={onClearSiteFilter}
        getToken={getToken}
        onSaved={vi.fn()}
        onEditBeforeSaving={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /search all sites/i }))
    expect(onClearSiteFilter).toHaveBeenCalled()
  })
})

describe('T23 — results grid renders 2 columns on desktop', () => {
  it('grid has md:grid-cols-2 class', async () => {
    const { default: DiscoveryResults } = await import('../DiscoveryResults')
    const { container } = render(
      <DiscoveryResults
        results={[sampleResult]}
        dismissedUrls={new Set()}
        status="done"
        siteFilter=""
        onDismiss={vi.fn()}
        onClearSiteFilter={vi.fn()}
        getToken={getToken}
        onSaved={vi.fn()}
        onEditBeforeSaving={vi.fn()}
      />
    )
    const grid = container.querySelector('.grid')
    expect(grid?.className).toContain('md:grid-cols-2')
  })
})

// ── PreviewSheet ───────────────────────────────────────────────────────────────

const scrapePayload = {
  title:               'Easy Chicken Stir Fry',
  ingredients:         '2 chicken breasts\n1 tbsp soy sauce',
  steps:               '1. Cook chicken\n2. Add vegetables',
  imageUrl:            null,
  sourceUrl:           sampleResult.url,
  partial:             false,
  suggestedTags:       ['Chicken', 'Quick'],
  suggestedNewTags:    [],
  prepTimeMinutes:     10,
  cookTimeMinutes:     20,
  totalTimeMinutes:    30,
  inactiveTimeMinutes: null,
  servings:            4,
}

describe('T12 — PreviewSheet calls POST /api/recipes/scrape with the URL', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('fetches /api/recipes/scrape on mount', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/recipes/scrape')) {
        return { ok: true, json: async () => scrapePayload } as Response
      }
      if (urlStr.includes('/api/recipes')) {
        return { ok: true, json: async () => [] } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })

    const { default: PreviewSheet } = await import('../PreviewSheet')
    await act(async () => {
      render(
        <PreviewSheet
          result={sampleResult}
          getToken={getToken}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onEditBeforeSaving={vi.fn()}
        />
      )
    })

    const scrapeCall = fetchSpy.mock.calls.find(([u]) => String(u).includes('/api/recipes/scrape'))
    expect(scrapeCall).toBeDefined()
    const opts = scrapeCall![1] as RequestInit
    expect(JSON.parse(opts.body as string).url).toBe(sampleResult.url)
  })
})

describe('T13 — PreviewSheet shows loading state while scraping', () => {
  it('shows loading spinner before scrape resolves', async () => {
    // PreviewSheet initialises with state='loading'; the spinner is rendered immediately
    // before any fetch completes.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/recipes/scrape')) {
        // Delay indefinitely so the loading state stays visible during the assertion
        return new Promise<Response>(() => { /* never resolves */ })
      }
      return { ok: true, json: async () => [] } as Response
    })

    const { default: PreviewSheet } = await import('../PreviewSheet')
    render(
      <PreviewSheet
        result={sampleResult}
        getToken={getToken}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onEditBeforeSaving={vi.fn()}
      />
    )

    // Initial state is 'loading' — spinner and message should be visible immediately
    expect(screen.getByText('Loading recipe…')).toBeInTheDocument()
  })
})

describe('T14 — scrape success renders title, ingredients, steps', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('renders scraped content after load', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/recipes/scrape')) {
        return { ok: true, json: async () => scrapePayload } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })

    const { default: PreviewSheet } = await import('../PreviewSheet')
    await act(async () => {
      render(
        <PreviewSheet
          result={sampleResult}
          getToken={getToken}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onEditBeforeSaving={vi.fn()}
        />
      )
    })

    await waitFor(() => {
      expect(screen.getByText(/2 chicken breasts/)).toBeInTheDocument()
      expect(screen.getByText(/1\. Cook chicken/)).toBeInTheDocument()
    })
  })
})

describe('T15 — "Save to Vault" calls POST /api/recipes with source: scraped', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('POSTs to /api/recipes with source: scraped', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/recipes/scrape')) {
        return { ok: true, json: async () => scrapePayload } as Response
      }
      if (urlStr === '/api/recipes' && (opts as RequestInit)?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'new-recipe-id' }) } as Response
      }
      if (urlStr === '/api/recipes') {
        return { ok: true, json: async () => [] } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })

    const { default: PreviewSheet } = await import('../PreviewSheet')
    await act(async () => {
      render(
        <PreviewSheet
          result={sampleResult}
          getToken={getToken}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onEditBeforeSaving={vi.fn()}
        />
      )
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save to vault/i })).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save to vault/i }))
    })

    await waitFor(() => {
      const saveCall = fetchSpy.mock.calls.find(
        ([u, o]) => String(u) === '/api/recipes' && (o as RequestInit)?.method === 'POST'
      )
      expect(saveCall).toBeDefined()
      const body = JSON.parse((saveCall![1] as RequestInit).body as string)
      expect(body.source).toBe('scraped')
    })
  })
})

describe('T16 — Save success shows "Saved to vault ✓" and view link', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('renders saved state after successful save', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opts) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/recipes/scrape')) {
        return { ok: true, json: async () => scrapePayload } as Response
      }
      if (urlStr === '/api/recipes' && (opts as RequestInit)?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'saved-123' }) } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })

    const onSaved = vi.fn()
    const { default: PreviewSheet } = await import('../PreviewSheet')
    await act(async () => {
      render(
        <PreviewSheet
          result={sampleResult}
          getToken={getToken}
          onClose={vi.fn()}
          onSaved={onSaved}
          onEditBeforeSaving={vi.fn()}
        />
      )
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save to vault/i })).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save to vault/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/Saved to vault ✓/)).toBeInTheDocument()
      expect(screen.getByText(/View in vault →/)).toBeInTheDocument()
    })
    expect(onSaved).toHaveBeenCalledWith(sampleResult.url)
  })
})

describe('T17 — duplicate URL shows "Already in your vault"', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('shows already-in-vault state when GET /api/recipes returns a match', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/recipes/scrape')) {
        return { ok: true, json: async () => scrapePayload } as Response
      }
      if (urlStr === '/api/recipes') {
        // Return a recipe with matching URL
        return {
          ok: true,
          json: async () => [
            { id: 'existing-id', title: 'Old Recipe', url: sampleResult.url },
          ],
        } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })

    const { default: PreviewSheet } = await import('../PreviewSheet')
    await act(async () => {
      render(
        <PreviewSheet
          result={sampleResult}
          getToken={getToken}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onEditBeforeSaving={vi.fn()}
        />
      )
    })

    await waitFor(() => {
      expect(screen.getByText('Already in your vault')).toBeInTheDocument()
      expect(screen.getByText('View →')).toBeInTheDocument()
    })
  })
})

describe('T18 — "Edit before saving" opens AddRecipeModal with pre-filled fields', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('calls onEditBeforeSaving with the scrape result', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/recipes/scrape')) {
        return { ok: true, json: async () => scrapePayload } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })

    const onEditBeforeSaving = vi.fn()
    const onClose = vi.fn()
    const { default: PreviewSheet } = await import('../PreviewSheet')
    await act(async () => {
      render(
        <PreviewSheet
          result={sampleResult}
          getToken={getToken}
          onClose={onClose}
          onSaved={vi.fn()}
          onEditBeforeSaving={onEditBeforeSaving}
        />
      )
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit before saving/i })).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /edit before saving/i }))
    })

    expect(onEditBeforeSaving).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Easy Chicken Stir Fry',
      ingredients: scrapePayload.ingredients,
    }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('T19 — scrape failure shows error with link to original URL', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('shows error message and link when scrape fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/recipes/scrape')) {
        return { ok: false, json: async () => ({ error: 'Scrape failed' }) } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })

    const { default: PreviewSheet } = await import('../PreviewSheet')
    await act(async () => {
      render(
        <PreviewSheet
          result={sampleResult}
          getToken={getToken}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onEditBeforeSaving={vi.fn()}
        />
      )
    })

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load this recipe/)).toBeInTheDocument()
      const link = screen.getByRole('link', { name: /open recipe/i })
      expect(link).toHaveAttribute('href', sampleResult.url)
    })
  })
})

// ── AppNav ─────────────────────────────────────────────────────────────────────

describe('T22 — Discover nav item appears in AppNav', () => {
  it('desktop nav has a Discover link to /discover', async () => {
    const { default: AppNav } = await import('@/components/layout/AppNav')
    render(<AppNav />)
    const discoverLinks = screen.getAllByRole('link', { name: /discover/i })
    expect(discoverLinks.some((l) => l.getAttribute('href') === '/discover')).toBe(true)
  })

  it('mobile nav has a Discover link to /discover', async () => {
    const { default: AppNav } = await import('@/components/layout/AppNav')
    render(<AppNav />)
    const discoverLinks = screen.getAllByRole('link', { name: /discover/i })
    // Both desktop and mobile nav render links — expect at least 2
    expect(discoverLinks.length).toBeGreaterThanOrEqual(2)
  })
})
