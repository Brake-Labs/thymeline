/**
 * spec-18 tests: Cook Mode reads from / clears sessionStorage AI-edit key
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// ── Mock next/navigation ──────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
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

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  sessionStorage.clear()
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => sampleRecipe,
    status: 200,
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
})

afterEach(() => {
  sessionStorage.clear()
  vi.resetModules()
})

// ── spec-18 T13: Cook Mode reads modified recipe from sessionStorage ───────────

describe('spec-18 T13 - Cook Mode reads modified recipe from sessionStorage', () => {
  it('uses modified recipe title when sessionStorage key is present', async () => {
    const modified = {
      title: 'Modified Roast Chicken',
      ingredients: '1 whole modified chicken',
      steps: 'Modified step 1\nModified step 2',
      notes: null,
      servings: 2,
    }
    sessionStorage.setItem('ai-modified-recipe-recipe-1', JSON.stringify(modified))
    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.getByText('Modified Roast Chicken')).toBeDefined(), { timeout: 2000 })
  })

  it('falls back to saved recipe when sessionStorage key is absent', async () => {
    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.getByText('Test Recipe')).toBeDefined(), { timeout: 2000 })
  })
})

// ── spec-18 T14: Cook Mode shows "Modified for tonight" banner ────────────────

describe('spec-18 T14 - Cook Mode shows "Modified for tonight" banner', () => {
  it('shows the banner when sessionStorage has a modified recipe', async () => {
    const modified = {
      title: 'Test Recipe',
      ingredients: 'modified ingredients',
      steps: 'Step 1\nStep 2',
      notes: null,
      servings: 4,
    }
    sessionStorage.setItem('ai-modified-recipe-recipe-1', JSON.stringify(modified))
    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.getByText('Modified for tonight')).toBeDefined(), { timeout: 2000 })
  })

  it('does not show the banner when no modified recipe in sessionStorage', async () => {
    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.queryByText('Modified for tonight')).toBeNull(), { timeout: 2000 })
  })
})

// ── spec-18 T22: sessionStorage key cleared on Cook Mode unmount ──────────────

describe('spec-18 T22 - sessionStorage key cleared on Cook Mode unmount', () => {
  it('removes the sessionStorage key when the component unmounts', async () => {
    const modified = {
      title: 'Test Recipe',
      ingredients: 'modified ingredients',
      steps: 'Step 1\nStep 2',
      notes: null,
      servings: 4,
    }
    sessionStorage.setItem('ai-modified-recipe-recipe-1', JSON.stringify(modified))

    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    const { unmount } = render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.getByText('Modified for tonight')).toBeDefined(), { timeout: 2000 })

    expect(sessionStorage.getItem('ai-modified-recipe-recipe-1')).not.toBeNull()

    unmount()

    expect(sessionStorage.getItem('ai-modified-recipe-recipe-1')).toBeNull()
  })
})
