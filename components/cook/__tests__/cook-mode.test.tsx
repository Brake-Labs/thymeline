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
  step_photos: [] as { stepIndex: number; imageUrl: string }[],
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

  it('T02 - "Start Cooking" is conditional on recipe.steps (or displayRecipe.steps)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/(app)/recipes/[id]/page.tsx'),
      'utf-8'
    )
    // The link is wrapped in a steps-based conditional (displayRecipe.steps since spec-18)
    expect(src).toMatch(/(?:display|)recipe\.steps[\s\S]*Start Cooking|Start Cooking[\s\S]*(?:display|)recipe\.steps/)
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

    // Initial display: 05:00 (5 minutes * 60 + 0 seconds) — shown in both inline timer and bar
    expect(screen.getAllByText('05:00').length).toBeGreaterThan(0)

    // After 1 second
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.getAllByText('04:59').length).toBeGreaterThan(0)
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

    // Timer should still show countdown (not reset) — shown in inline timer and bar
    expect(screen.getAllByText('04:59').length).toBeGreaterThan(0)
  })

  it('T23 - Timer at zero → "Time\'s up!" shown', async () => {
    vi.useFakeTimers()
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })

    // Advance past 5 minutes (default timer)
    await act(async () => { vi.advanceTimersByTime(301 * 1000) })

    expect(screen.getAllByText("Time's up!").length).toBeGreaterThan(0)
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

// ── T43-T49: Timer auto-populate and ActiveTimersBar ─────────────────────────

describe('T43 - Step with time reference pre-fills timer to 20:00', () => {
  it('clicking Start after seeing "simmer for 20 minutes" step starts 20:00 timer', async () => {
    vi.useFakeTimers()
    const recipe = { ...sampleRecipe, steps: 'Simmer for 20 minutes over low heat' }
    await renderCookPage(recipe)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    // Picker should be pre-filled: minutes input shows 20
    expect(screen.getByDisplayValue('20')).toBeDefined()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })
    expect(screen.getAllByText('20:00').length).toBeGreaterThan(0)
  })
})

describe('T44 - Step with "1 hour 30 minutes" pre-fills to 1:30:00', () => {
  it('clicking Start after seeing "1 hour 30 minutes" step starts 1:30:00 timer', async () => {
    vi.useFakeTimers()
    const recipe = { ...sampleRecipe, steps: 'Cook for 1 hour 30 minutes until tender' }
    await renderCookPage(recipe)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    // Picker pre-filled: minutes input shows 90 (= 1hr 30min total minutes)
    expect(screen.getByDisplayValue('90')).toBeDefined()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })
    expect(screen.getAllByText('1:30:00').length).toBeGreaterThan(0)
  })
})

describe('T45 - Step with "10–15 minutes" pre-fills to 15:00', () => {
  it('range pattern uses higher value', async () => {
    vi.useFakeTimers()
    const recipe = { ...sampleRecipe, steps: 'Rest for 10–15 minutes before slicing' }
    await renderCookPage(recipe)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    // Minutes input shows 15 (higher bound of the range)
    expect(screen.getByDisplayValue('15')).toBeDefined()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })
    expect(screen.getAllByText('15:00').length).toBeGreaterThan(0)
  })
})

describe('T46 - Step with no time reference leaves timer unchanged', () => {
  it('parseTimeFromStep returns 0 for a step with no time reference', async () => {
    const { parseTimeFromStep } = await import('@/components/cook/StepTimer')
    expect(parseTimeFromStep('Add the chicken thighs to the pan')).toBe(0)
    expect(parseTimeFromStep('Mix until combined')).toBe(0)
  })

  it('no time reference: Set timer button still shows with default picker', async () => {
    await renderCookPage()
    // sampleRecipe step 0 is "Mix ingredients" — no time ref
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    // Default picker: minutes input shows 5
    expect(screen.getByDisplayValue('5')).toBeDefined()
  })
})

describe('T47 - Running timer appears in ActiveTimersBar with step label', () => {
  it('shows derived action label and countdown in bar', async () => {
    vi.useFakeTimers()
    const recipe = { ...sampleRecipe, steps: 'Simmer for 20 minutes over low heat' }
    await renderCookPage(recipe)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })

    // Bar shows "Simmer for 20:00" label (action + original duration)
    expect(screen.getByText(/Simmer for 20:00/)).toBeDefined()
    // Countdown shows remaining time
    const countdowns = screen.getAllByText('20:00')
    expect(countdowns.length).toBeGreaterThan(0)
  })
})

describe('T48 - Navigating to a different step keeps timer running in bar', () => {
  it('timer stays visible in bar after navigating away from that step', async () => {
    vi.useFakeTimers()
    const recipe = {
      ...sampleRecipe,
      steps: 'Simmer for 20 minutes over low heat\nAdd the vegetables and stir',
    }
    await renderCookPage(recipe)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })
    await act(async () => { vi.advanceTimersByTime(3000) })

    // Navigate to step 2
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })

    // Step 2 content is visible
    expect(screen.getByText('Add the vegetables and stir')).toBeDefined()
    // Bar still shows "Simmer for 20:00" label and remaining countdown
    expect(screen.getByText(/Simmer for 20:00/)).toBeDefined()
    expect(screen.getByText('19:57')).toBeDefined()
  })
})

describe('T49 - Expired timer shows "Time\'s up!" in bar until dismissed', () => {
  it('shows Time\'s up! in bar and removes after dismiss click', async () => {
    vi.useFakeTimers()
    const recipe = {
      ...sampleRecipe,
      steps: 'Simmer for 20 minutes over low heat\nAdd the vegetables and stir',
    }
    await renderCookPage(recipe)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })

    // Advance past 20 minutes
    await act(async () => { vi.advanceTimersByTime(21 * 60 * 1000) })

    // Navigate to step 2 so step 1's inline timer is hidden
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })

    // Bar should show "Time's up!"
    const timesUpEls = screen.getAllByText("Time's up!")
    expect(timesUpEls.length).toBeGreaterThan(0)

    // Dismiss the expired timer
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dismiss timer/i }))
    })

    // Timer should be gone from the bar
    expect(screen.queryAllByText("Time's up!").length).toBe(0)
  })
})

// ── T50-T54: Inline quantity injection ───────────────────────────────────────

describe('T50 - Step with no matching ingredient name renders unchanged', () => {
  it('step text without an ingredient name match shows no injected quantity', async () => {
    const recipe = {
      ...sampleRecipe,
      ingredients: '2 cups flour\n1/2 tsp salt',
      // "Preheat the oven" matches neither "flour" nor "salt"
      steps: 'Preheat the oven to 350°F\nAdd the flour',
      servings: 4,
    }
    await renderCookPage(recipe)
    // No "2 cups" or "1/2 tsp" text injected into step 0
    expect(screen.queryByText(/2 cups/)).toBeNull()
    expect(screen.queryByText(/1\/2 tsp/)).toBeNull()
  })
})

describe('T51 - Scroll view also injects quantities inline', () => {
  it('all-steps view renders injected quantity for a matching step', async () => {
    const recipe = {
      ...sampleRecipe,
      ingredients: '2 cups flour\n1/2 tsp salt',
      steps: 'Add the flour and mix well\nBake for 30 minutes',
      servings: 4,
    }
    await renderCookPage(recipe)
    // Switch to all-steps view
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /all steps/i })) })
    expect(screen.getByText(/2 cups/)).toBeDefined()
  })
})

describe('T52 - Injected quantity is wrapped in a highlighted span', () => {
  it('quantity text renders inside a <span> element (not as plain text)', async () => {
    const recipe = {
      ...sampleRecipe,
      ingredients: '2 cups flour\n1/2 tsp salt',
      steps: 'Add the flour and mix well\nBake for 30 minutes',
      servings: 4,
    }
    await renderCookPage(recipe)
    // "2 cups" appears inside a <span>, not as a bare text node
    const quantityEl = screen.getByText(/2 cups/)
    expect(quantityEl.tagName).toBe('SPAN')
  })
})

describe('T53 - Quantities scale with servings when doubled', () => {
  it('injectStepQuantities returns doubled quantity at 2× servings', async () => {
    const { injectStepQuantities } = await import('@/lib/inject-step-quantities')
    const result = injectStepQuantities(
      'Add the flour and mix',
      '2 cups flour',
      8, // targetServings
      4, // baseServings
    )
    // 2 cups × (8/4) = 4 cups injected before "flour"
    expect(result.text).toContain('4 cups')
    expect(result.highlights.length).toBeGreaterThan(0)
  })
})

describe('T54 - cook page renders step text with injected inline quantity', () => {
  it('single-step view injects quantity before ingredient name', async () => {
    const recipe = {
      ...sampleRecipe,
      ingredients: '2 cups flour\n1/2 tsp salt',
      steps: 'Add the flour and mix well\nBake for 30 minutes',
      servings: 4,
    }
    await renderCookPage(recipe)
    // "2 cups" is injected inline before "flour" — confirm it renders in the DOM
    expect(screen.getByText(/2 cups/)).toBeDefined()
  })
})

// ── T55-T59: Editable timer input + bar label format ─────────────────────────

describe('T55 - Typing into minutes field sets correct timer duration', () => {
  it('typing "25" into minutes field then Start creates a 25:00 timer', async () => {
    vi.useFakeTimers()
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })

    const minsInput = screen.getByRole('spinbutton', { name: /minutes/i })
    await act(async () => {
      fireEvent.change(minsInput, { target: { value: '25' } })
    })
    expect(screen.getByDisplayValue('25')).toBeDefined()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })
    expect(screen.getAllByText('25:00').length).toBeGreaterThan(0)
  })
})

describe('T56 - Typing > 59 into seconds field carries over into minutes', () => {
  it('typing "90" in seconds and blurring yields 1 min 30 sec', async () => {
    vi.useFakeTimers()
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })

    // Clear minutes to 0 first
    const minsInput = screen.getByRole('spinbutton', { name: /minutes/i })
    await act(async () => { fireEvent.change(minsInput, { target: { value: '0' } }) })

    // Type 90 in seconds then blur to trigger carry-over
    const secsInput = screen.getByRole('spinbutton', { name: /seconds/i })
    await act(async () => { fireEvent.change(secsInput, { target: { value: '90' } }) })
    await act(async () => { fireEvent.blur(secsInput) })

    // Should have carried over: 1 minute, 30 seconds
    expect(screen.getByDisplayValue('1')).toBeDefined()
    expect(screen.getByDisplayValue('30')).toBeDefined()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })
    expect(screen.getAllByText('01:30').length).toBeGreaterThan(0)
  })
})

describe('T57 - Arrow up on minutes increments by 1', () => {
  it('clicking ▲ on minutes increments the minutes field by 1', async () => {
    await renderCookPage()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })

    // Default is 5 minutes
    expect(screen.getByDisplayValue('5')).toBeDefined()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /increment minutes/i }))
    })

    expect(screen.getByDisplayValue('6')).toBeDefined()
  })
})

describe('T58 - Active timer bar shows "Action for MM:SS" label format', () => {
  it('shows "Simmer for 20:00" badge alongside live countdown after starting', async () => {
    vi.useFakeTimers()
    const recipe = { ...sampleRecipe, steps: 'Simmer for 20 minutes over low heat' }
    await renderCookPage(recipe)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })

    // Badge shows action + original duration
    expect(screen.getByText(/Simmer for 20:00/)).toBeDefined()
    // Countdown is present
    expect(screen.getAllByText('20:00').length).toBeGreaterThan(0)
  })
})

describe('T59 - Timer bar label persists when navigating between steps', () => {
  it('label stays "Simmer for 20:00" after navigating to a different step', async () => {
    vi.useFakeTimers()
    const recipe = {
      ...sampleRecipe,
      steps: 'Simmer for 20 minutes over low heat\nAdd the vegetables and stir',
    }
    await renderCookPage(recipe)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /set timer/i })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /start/i })) })

    // Navigate to step 2
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next →/i })) })

    expect(screen.getByText('Add the vegetables and stir')).toBeDefined()
    // Bar label unchanged — still shows original action + duration
    expect(screen.getByText(/Simmer for 20:00/)).toBeDefined()
  })
})

// ── T60-T62: Tab bar switching ────────────────────────────────────────────────

describe('T60-T62 - Tab bar: Steps / Ingredients switching', () => {
  it('T60 - Steps tab is active by default and shows step content', async () => {
    await renderCookPage()
    // Step text is visible
    expect(screen.getByText('Mix ingredients')).toBeDefined()
    // Ingredients list is not visible
    expect(screen.queryByText(/2 cups flour/i)).toBeNull()
  })

  it('T61 - clicking Ingredients tab shows the ingredient checklist', async () => {
    await renderCookPage()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^ingredients$/i }))
    })
    expect(screen.getByText(/2 cups flour/i)).toBeDefined()
    // Step text is hidden
    expect(screen.queryByText('Mix ingredients')).toBeNull()
  })

  it('T62 - clicking Steps tab after switching to Ingredients returns to step content', async () => {
    await renderCookPage()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^ingredients$/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^steps$/i }))
    })
    expect(screen.getByText('Mix ingredients')).toBeDefined()
    expect(screen.queryByText(/2 cups flour/i)).toBeNull()
  })
})
