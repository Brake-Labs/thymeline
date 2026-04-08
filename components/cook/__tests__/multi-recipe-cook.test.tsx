/**
 * Multi-recipe cook page: regression tests for the Steps / Ingredients tab bar
 * added in fix/cook-mode-edits-259 (#260).
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => <a href={href} {...props}>{children}</a>,
}))


// ── Sample data ───────────────────────────────────────────────────────────────

const sampleRecipe = {
  id: 'recipe-1',
  userId: 'user-1',
  title: 'Weeknight Dinner',
  category: 'main_dish' as const,
  tags: [],
  isShared: false,
  ingredients: 'Pasta\nSalt\nOlive oil',
  steps: 'Boil water\nCook pasta\nDrain and serve',
  notes: null,
  url: null,
  imageUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  source: 'manual' as const,
  servings: 4,
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  totalTimeMinutes: 20,
  inactiveTimeMinutes: null,
  stepPhotos: [],
  lastMade: null,
  timesMade: 0,
  datesMade: [],
}

// Plan with a single recipe entry for 2026-01-05 so the component goes
// straight to cook mode (no selection screen).
const singleEntryPlan = {
  plan: {
    entries: [
      {
        recipeId: 'recipe-1',
        plannedDate: '2026-01-05',
        mealType: 'dinner',
        isSideDish: false,
        parentEntryId: null,
      },
    ],
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function flushEffects() {
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve() })
  }
}

async function renderPage(recipe = sampleRecipe) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes('/api/plan')) {
      return Promise.resolve({ ok: true, json: async () => singleEntryPlan, status: 200 })
    }
    return Promise.resolve({ ok: true, json: async () => recipe, status: 200 })
  })

  Object.defineProperty(navigator, 'wakeLock', {
    value: {
      request: vi.fn().mockResolvedValue({
        released: false,
        release: vi.fn().mockResolvedValue(undefined),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        type: 'screen' as WakeLockType,
      }),
    },
    writable: true,
    configurable: true,
  })

  const { default: MultiRecipeCookPage } = await import('@/app/(cook)/meal/[date]/page')
  render(<MultiRecipeCookPage params={{ date: '2026-01-05' }} />)
  await flushEffects()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('multi-recipe cook page — activeTab tab switching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('regression: Steps tab is active by default and shows step content', async () => {
    await renderPage()
    expect(screen.getByRole('button', { name: /^steps$/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /^ingredients$/i })).toBeDefined()
    expect(screen.getByText('Boil water')).toBeDefined()
    expect(screen.queryByText('Pasta')).toBeNull()
  })

  it('regression: clicking Ingredients tab shows the ingredient checklist', async () => {
    await renderPage()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^ingredients$/i }))
    })
    expect(screen.getByText('Pasta')).toBeDefined()
    expect(screen.queryByText('Boil water')).toBeNull()
  })

  it('regression: clicking Steps tab after switching to Ingredients returns to step content', async () => {
    await renderPage()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^ingredients$/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^steps$/i }))
    })
    expect(screen.getByText('Boil water')).toBeDefined()
    expect(screen.queryByText('Pasta')).toBeNull()
  })
})
