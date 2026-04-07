/**
 * minimal test to diagnose OOM
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'test-token',
}))

const sampleRecipe = {
  id: 'recipe-1', user_id: 'user-1', title: 'Test Recipe',
  category: 'main_dish' as const, tags: [], is_shared: false,
  ingredients: '2 cups flour', steps: 'Step A\nStep B\nStep C',
  notes: null, url: null, image_url: null, created_at: '2026-01-01T00:00:00Z',
  source: 'manual' as const, servings: 4, prep_time_minutes: null,
  cook_time_minutes: null, total_time_minutes: null, inactive_time_minutes: null,
  step_photos: [] as { stepIndex: number; imageUrl: string }[],
  last_made: null, times_made: 0, dates_made: [],
}

beforeEach(() => {
  sessionStorage.clear()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => sampleRecipe, status: 200 })
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request: vi.fn().mockResolvedValue({ released: false, release: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn(), removeEventListener: vi.fn(), type: 'screen' as WakeLockType }) },
    writable: true, configurable: true,
  })
})
afterEach(() => { sessionStorage.clear(); vi.resetModules() })

describe('minimal save-as-new tests', () => {
  it('T15: no Save as New without modification', async () => {
    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.getByText('Next →')).toBeDefined(), { timeout: 2000 })
    fireEvent.click(screen.getByText('Next →'))
    fireEvent.click(screen.getByText('Next →'))
    expect(screen.queryByText('Save as New')).toBeNull()
  })

  it('T15: Save as New appears with modification', async () => {
    sessionStorage.setItem('ai-modified-recipe-recipe-1', JSON.stringify({ title: 'Test Recipe', ingredients: 'mod', steps: 'Step A\nStep B\nStep C', notes: null, servings: 4 }))
    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.getByText('Modified for tonight')).toBeDefined(), { timeout: 2000 })
    fireEvent.click(screen.getByText('Next →'))
    fireEvent.click(screen.getByText('Next →'))
    expect(screen.getByText('Save as New')).toBeDefined()
  })

  it('T16: POSTs with (modified) title', async () => {
    sessionStorage.setItem('ai-modified-recipe-recipe-1', JSON.stringify({ title: 'Test Recipe', ingredients: 'mod', steps: 'Step A\nStep B\nStep C', notes: null, servings: 4 }))
    let body: Record<string, unknown> | null = null
    global.fetch = vi.fn().mockImplementation(async (_u: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') { body = JSON.parse(opts.body as string) as Record<string, unknown>; return { ok: true, json: async () => ({}), status: 201 } }
      return { ok: true, json: async () => sampleRecipe, status: 200 }
    })
    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.getByText('Modified for tonight')).toBeDefined(), { timeout: 2000 })
    fireEvent.click(screen.getByText('Next →'))
    fireEvent.click(screen.getByText('Next →'))
    fireEvent.click(screen.getByText('Save as New'))
    await waitFor(() => expect(body).not.toBeNull(), { timeout: 2000 })
    expect((body as unknown as Record<string, unknown>).title).toBe('Test Recipe (modified)')
  })

  it('T16: shows Saved! after success', async () => {
    sessionStorage.setItem('ai-modified-recipe-recipe-1', JSON.stringify({ title: 'Test Recipe', ingredients: 'mod', steps: 'Step A\nStep B\nStep C', notes: null, servings: 4 }))
    global.fetch = vi.fn().mockImplementation(async (_u: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return { ok: true, json: async () => ({}), status: 201 }
      return { ok: true, json: async () => sampleRecipe, status: 200 }
    })
    const { default: CookModePage } = await import('@/app/(cook)/recipes/[id]/cook/page')
    render(<CookModePage params={{ id: 'recipe-1' }} />)
    await waitFor(() => expect(screen.getByText('Modified for tonight')).toBeDefined(), { timeout: 2000 })
    fireEvent.click(screen.getByText('Next →'))
    fireEvent.click(screen.getByText('Next →'))
    fireEvent.click(screen.getByText('Save as New'))
    await waitFor(() => expect(screen.getByText('✓ Saved!')).toBeDefined(), { timeout: 2000 })
  })
})
