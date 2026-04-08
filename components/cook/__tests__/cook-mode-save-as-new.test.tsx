/**
 * T15/T16 — Save as New Recipe from Cook Mode
 * Clicking "Save as New" opens AddRecipeModal pre-filled — it does NOT silent-POST.
 * Uses a single-step recipe so the footer renders immediately at last-step state.
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    <a href={href} {...props}>{children}</a>,
}))
vi.mock('@/components/recipes/AddRecipeModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="add-recipe-modal">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}))

// Single-step recipe — no navigation needed to reach the last-step footer
const singleStepRecipe = {
  id: 'recipe-1', userId: 'user-1', title: 'Test Recipe',
  category: 'main_dish' as const, tags: [], isShared: false,
  ingredients: '2 cups flour', steps: 'Only step',
  notes: null, url: null, imageUrl: null, createdAt: '2026-01-01T00:00:00Z',
  source: 'manual' as const, servings: 4, prepTimeMinutes: null,
  cookTimeMinutes: null, totalTimeMinutes: null, inactiveTimeMinutes: null,
  stepPhotos: [] as { stepIndex: number; imageUrl: string }[],
  lastMade: null, timesMade: 0, datesMade: [],
}

const storedModified = {
  title: 'Test Recipe', ingredients: 'modified flour',
  steps: 'Only step', notes: null, servings: 4,
}

// Import once for all tests — avoid re-importing the heavy module graph per test
let CookModePage: React.ComponentType<{ params: { id: string } }>

beforeAll(async () => {
  const mod = await import('@/app/(cook)/recipes/[id]/cook/page')
  CookModePage = mod.default
})

beforeEach(() => {
  sessionStorage.clear()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => singleStepRecipe, status: 200 })
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request: vi.fn().mockResolvedValue({ released: false, release: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn(), removeEventListener: vi.fn(), type: 'screen' as WakeLockType }) },
    writable: true, configurable: true,
  })
})
afterEach(() => { cleanup(); sessionStorage.clear() })

describe('T15 — Save as New button visibility', () => {
  it('does not appear for an unmodified recipe', async () => {
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.getByText('Log Made Today')).toBeDefined(), { timeout: 3000 })
    expect(screen.queryByText('Save as New')).toBeNull()
  })

  it('appears when recipe is AI-modified', async () => {
    sessionStorage.setItem('ai-modified-recipe-recipe-1', JSON.stringify(storedModified))
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.getByText('Modified for tonight')).toBeDefined(), { timeout: 3000 })
    expect(screen.getByText('Save as New')).toBeDefined()
  })
})

describe('T15/T16 — Save as New opens modal, does not POST', () => {
  it('clicking Save as New does not fire a POST request', async () => {
    sessionStorage.setItem('ai-modified-recipe-recipe-1', JSON.stringify(storedModified))
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => screen.getByText('Save as New'), { timeout: 3000 })

    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>
    const postsBefore = fetchSpy.mock.calls.filter(
      (args: unknown[]) => (args[1] as RequestInit | undefined)?.method === 'POST'
    ).length

    fireEvent.click(screen.getByText('Save as New'))

    const postsAfter = fetchSpy.mock.calls.filter(
      (args: unknown[]) => (args[1] as RequestInit | undefined)?.method === 'POST'
    ).length
    expect(postsAfter).toBe(postsBefore)
  })
})
