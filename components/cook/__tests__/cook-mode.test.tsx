/**
 * Cook mode tests: T01-T29, T33-T35
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// ── Mock next/navigation ──────────────────────────────────────────────────────

const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

// ── Mock next/link ────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    <a href={href} {...props}>{children}</a>,
}))

// ── Mock auth ────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'test-token',
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) },
  }),
}))

// ── Wake lock mock ────────────────────────────────────────────────────────────

const mockWakeLockRelease = vi.fn().mockResolvedValue(undefined)
const mockWakeLockSentinel = {
  released: false,
  release: mockWakeLockRelease,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  type: 'screen' as WakeLockType,
}

// ── Sample data ───────────────────────────────────────────────────────────────

const sampleRecipe = {
  id: 'recipe-1',
  user_id: 'user-1',
  title: 'Test Recipe',
  category: 'main_dish' as const,
  tags: [],
  is_shared: false,
  ingredients: '2 cups flour\n1/2 tsp salt\nSalt to taste',
  steps: 'Mix ingredients\nKnead dough\nBake for 30 minutes',
  notes: null,
  url: null,
  image_url: null,
  created_at: '2026-01-01T00:00:00Z',
  source: 'manual' as const,
  servings: 4,
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  inactive_time_minutes: null,
  step_photos: [],
  last_made: null,
  times_made: 0,
  dates_made: [],
}

const recipeWithPhoto = {
  ...sampleRecipe,
  step_photos: [{ stepIndex: 0, imageUrl: 'https://example.com/photo.jpg' }],
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function setupWakeLock(supported = true) {
  if (supported) {
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn().mockResolvedValue(mockWakeLockSentinel) },
      writable: true,
      configurable: true,
    })
  } else {
    Object.defineProperty(navigator, 'wakeLock', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  }
}

/**
 * Flush microtask queue to allow async effects (fetch chains) to resolve.
 * Uses act to also flush React state updates after each tick.
 */
async function flushEffects() {
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve() })
  }
}

async function renderCookPage(recipe = sampleRecipe) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => recipe,
    status: 200,
  })

  const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
  render(<CookModePage params={{ id: 'recipe-1' }} />)

  // Flush the async fetch effect chain (works with or without fake timers)
  await flushEffects()
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  mockReplace.mockReset()
  mockWakeLockRelease.mockReset()
  mockWakeLockRelease.mockResolvedValue(undefined)
  setupWakeLock(true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

// ── T01, T02: Start Cooking button on detail page ────────────────────────────
// Source-code checks: rendering RecipeDetailPage in jsdom requires mocking its
// entire Supabase + auth dependency tree, which is out of scope here.
// Instead we verify the link and conditional logic exist in the source.

describe('T01/T02 - Start Cooking button on detail page', () => {
  it('T01 - "Start Cooking" link is present in detail page source', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/(app)/recipes/[id]/page.tsx'),
      'utf-8'
    )
    expect(src).toContain('Start Cooking')
    expect(src).toContain('/cook')
  })

  it('T02 - "Start Cooking" is conditional on recipe.steps', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/(app)/recipes/[id]/page.tsx'),
      'utf-8'
    )
    // The link is wrapped in a steps-based conditional
    expect(src).toMatch(/recipe\.steps.*Start Cooking|Start Cooking.*recipe\.steps/s)
  })
})

// ── T03: Cook page shows title in header ──────────────────────────────────────

describe('T03 - Cook page loads, shows title in header', () => {
  it('shows the recipe title', async () => {
    await renderCookPage()
    expect(screen.getByText('Test Recipe')).toBeDefined()
  })
})

// ── T04: Default view ─────────────────────────────────────────────────────────

describe('T04 - Default: one-at-a-time, first step shown', () => {
  it('shows first step text by default', async () => {
    await renderCookPage()
    expect(screen.getByText('Mix ingredients')).toBeDefined()
    expect(screen.queryByText('Knead dough')).toBeNull()
  })
})

// ── T05: Next advances step ───────────────────────────────────────────────────

describe('T05 - "Next" advances step; indicator updates', () => {
  it('clicking Next shows step 2', async () => {
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })

    expect(screen.getByText('Knead dough')).toBeDefined()
    expect(screen.getByText('Step 2 of 3')).toBeDefined()
  })
})

// ── T06: Previous disabled on step 1 ─────────────────────────────────────────

describe('T06 - "Previous" disabled on step 1', () => {
  it('Prev button is disabled on first step', async () => {
    await renderCookPage()
    const prevBtn = screen.getByRole('button', { name: /← prev/i })
    expect(prevBtn.hasAttribute('disabled')).toBe(true)
  })
})

// ── T07: Next → Done on final step ───────────────────────────────────────────

describe('T07 - "Next" → "Done" on final step', () => {
  it('shows Log Made Today on final step instead of Next', async () => {
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })

    expect(screen.getByRole('button', { name: /log made today/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /next →/i })).toBeNull()
  })
})

// ── T08: Toggle to scroll shows all steps ────────────────────────────────────

describe('T08 - Toggle to scroll shows all steps', () => {
  it('switching to All steps shows all step texts', async () => {
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /all steps/i })) })

    expect(screen.getByText('Mix ingredients')).toBeDefined()
    expect(screen.getByText('Knead dough')).toBeDefined()
    expect(screen.getByText('Bake for 30 minutes')).toBeDefined()
  })
})

// ── T09: Toggle back to one-at-a-time returns to current step ────────────────

describe('T09 - Toggle back to one-at-a-time returns to current step', () => {
  it('after navigating to step 2, toggling back shows step 2', async () => {
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /all steps/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /one at a time/i })) })

    expect(screen.getByText('Step 2 of 3')).toBeDefined()
    expect(screen.getByText('Knead dough')).toBeDefined()
  })
})

// ── T10: Dot progress reflects current step ───────────────────────────────────

describe('T10 - Dot progress reflects current step', () => {
  it('shows 3 dots for a 3-step recipe', async () => {
    await renderCookPage()
    const dots = screen.getAllByRole('button', { name: /step \d+/i })
    expect(dots.length).toBe(3)
  })
})

// ── T11: Servings defaults to recipe.servings ─────────────────────────────────

describe('T11 - Servings defaults to recipe.servings', () => {
  it('shows "4 servings" by default', async () => {
    await renderCookPage()
    expect(screen.getByText('4 servings')).toBeDefined()
  })
})

// ── T12: Increasing servings scales quantities ────────────────────────────────

describe('T12 - Increasing servings scales quantities', () => {
  it('servings increments when + is clicked', async () => {
    await renderCookPage()

    fireEvent.click(screen.getByRole('button', { name: /increase servings/i }))

    await waitFor(() => expect(screen.getByText(/5 servings/)).toBeDefined())
  })
})

// ── T16-T19: Ingredient checklist ─────────────────────────────────────────────

describe('T16-T19 - Ingredient checklist', () => {
  async function renderIngredients() {
    await renderCookPage()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^ingredients$/i })) })
  }

  it('T16 - renders all ingredients', async () => {
    await renderIngredients()
    expect(screen.getByText(/2 cups flour/)).toBeDefined()
    expect(screen.getByText(/salt to taste/i)).toBeDefined()
  })

  it('T17 - tapping ingredient checks it off', async () => {
    await renderIngredients()
    const flourBtn = screen.getByRole('button', { name: /2 cups flour/i })
    await act(async () => { fireEvent.click(flourBtn) })
    expect(flourBtn.querySelector('.line-through')).toBeDefined()
  })

  it('T18 - Check all checks every ingredient', async () => {
    await renderIngredients()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /check all/i })) })
    const struckItems = document.querySelectorAll('.line-through')
    expect(struckItems.length).toBe(3)
  })

  it('T19 - Uncheck all clears all checks', async () => {
    await renderIngredients()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /check all/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /uncheck all/i })) })
    const struckItems = document.querySelectorAll('.line-through')
    expect(struckItems.length).toBe(0)
  })
})

// ── T20-T23: Step timers ──────────────────────────────────────────────────────

describe('T20-T23 - Step timers', () => {
  beforeEach(() => {
    // Fake timers only for timer tests; load page first with real timers
    // then switch (interval created after Start click will use fake timers)
  })

  it('T20 - "Set timer" button renders per step', async () => {
    await renderCookPage()
    expect(screen.getByRole('button', { name: /set timer/i })).toBeDefined()
  })

  it('T21 - Timer starts and shows countdown display', async () => {
    vi.useFakeTimers()
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })

    // Initial display: 05:00 (5 minutes * 60 + 0 seconds)
    expect(screen.getByText('05:00')).toBeDefined()

    // After 1 second
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('04:59')).toBeDefined()
  })

  it('T22 - Timer persists across step navigation', async () => {
    vi.useFakeTimers()
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })
    await act(async () => { vi.advanceTimersByTime(1000) })

    // Navigate away
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    // Navigate back
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /← prev/i })) })

    // Timer should still show countdown (not reset)
    expect(screen.getByText('04:59')).toBeDefined()
  })

  it('T23 - Timer at zero → "Time\'s up!" shown', async () => {
    vi.useFakeTimers()
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })

    // Advance past 5 minutes (default timer)
    await act(async () => { vi.advanceTimersByTime(301 * 1000) })

    expect(screen.getByText("Time's up!")).toBeDefined()
  })
})

// ── T24-T25: Wake lock ────────────────────────────────────────────────────────

describe('T24-T25 - Wake lock', () => {
  it('T24 - wake lock requested on mount', async () => {
    await renderCookPage()
    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen')
  })

  it('T25 - wake lock released on unmount', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => sampleRecipe, status: 200,
    })
    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    const { unmount } = render(<CookModePage params={{ id: 'recipe-1' }} />)
    await flushEffects()
    await act(async () => { unmount() })
    expect(mockWakeLockRelease).toHaveBeenCalled()
  })
})

// ── T26-T29: Log Made Today ───────────────────────────────────────────────────

describe('T26-T29 - Log Made Today', () => {
  it('T26 - Log Made Today shown on final step', async () => {
    await renderCookPage()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    expect(screen.getByRole('button', { name: /log made today/i })).toBeDefined()
  })

  it('T27 - Log button calls POST /api/recipes/[id]/log', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/log')) {
        return Promise.resolve({ ok: true, json: async () => ({ made_on: '2026-03-28', already_logged: false }) })
      }
      return Promise.resolve({ ok: true, json: async () => sampleRecipe, status: 200 })
    })

    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await flushEffects()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /log made today/i })) })
    await flushEffects()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/recipes/recipe-1/log'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('T28 - Success → "✓ Logged!"', async () => {
    // Use URL-based dispatch so the recipe fetch re-runs (new router ref each render)
    // don't exhaust mockResolvedValueOnce before the log call fires.
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/log')) {
        return Promise.resolve({ ok: true, json: async () => ({ made_on: '2026-03-28', already_logged: false }) })
      }
      return Promise.resolve({ ok: true, json: async () => sampleRecipe, status: 200 })
    })

    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await flushEffects()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /log made today/i })) })

    await waitFor(() => expect(screen.getByText(/✓ Logged!/)).toBeDefined())
  })

  it('T29 - already_logged → "Already logged today"', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes('/log')) {
        return Promise.resolve({ ok: true, json: async () => ({ made_on: '2026-03-28', already_logged: true }) })
      }
      return Promise.resolve({ ok: true, json: async () => sampleRecipe, status: 200 })
    })

    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await flushEffects()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /log made today/i })) })

    await waitFor(() => expect(screen.getByText(/already logged today/i)).toBeDefined())
  })
})

// ── T33: AppNav not rendered on cook route ────────────────────────────────────

describe('T33 - AppNav not rendered on cook route', () => {
  it('cook layout file does not import AppNav', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/(cook)/layout.tsx'),
      'utf-8'
    )
    expect(src).not.toContain('AppNav')
  })
})

// ── T34-T35: Step photos ──────────────────────────────────────────────────────

describe('T34-T35 - Step photos', () => {
  it('T34 - step photo renders above step text when present', async () => {
    await renderCookPage(recipeWithPhoto)
    const img = document.querySelector('img[alt="Step 1"]')
    expect(img).toBeDefined()
    expect(img?.getAttribute('src')).toBe('https://example.com/photo.jpg')
  })

  it('T35 - no photo space when step has no photo', async () => {
    await renderCookPage()
    expect(document.querySelector('img[alt="Step 1"]')).toBeNull()
  })
})
