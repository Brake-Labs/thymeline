// @vitest-environment jsdom
/**
 * Tests for RecipePageContent.handleDeleteCustomTag.
 * Verifies the handler calls DELETE /api/tags/:name with auth header
 * and refetches the recipe list on success.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import RecipePageContent from '../RecipePageContent'

afterEach(() => cleanup())

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))


// Stub heavy child components — FilterSidebar is mocked to expose onDeleteTag
const mockOnDeleteTag = vi.fn()
vi.mock('@/components/recipes/FilterSidebar', () => ({
  default: ({ onDeleteTag }: { onDeleteTag?: (tag: string) => Promise<void> }) => {
    // Capture onDeleteTag so tests can invoke it
    if (onDeleteTag) mockOnDeleteTag.mockImplementation(onDeleteTag)
    return <div data-testid="filter-sidebar" />
  },
}))

vi.mock('@/components/recipes/RecipeGrid', () => ({
  default: () => <div data-testid="recipe-grid" />,
}))
vi.mock('@/components/recipes/RecipeListView', () => ({
  default: () => <div data-testid="recipe-list" />,
}))
vi.mock('@/components/recipes/BulkActionBar', () => ({
  default: () => <div />,
}))
vi.mock('@/components/recipes/BulkTagModal', () => ({
  default: () => <div />,
}))
vi.mock('@/components/recipes/AddRecipeModal', () => ({
  default: () => <div />,
}))
vi.mock('@/components/recipes/GenerateRecipeModal', () => ({
  default: () => <div />,
}))

// ── handleDeleteCustomTag ─────────────────────────────────────────────────────

describe('RecipePageContent - handleDeleteCustomTag', () => {
  beforeEach(() => {
    mockOnDeleteTag.mockReset()
    vi.stubGlobal('fetch', vi.fn())
    localStorage.clear()
    // Pre-open the filter sidebar so FilterSidebar mounts on first render
    localStorage.setItem('thymeline:filter-sidebar', 'true')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  function makeDeleteResponse(status = 204): Response {
    return { ok: status < 400, status, json: async () => ({}) } as Response
  }

  /** Creates a url-based fetch implementation that handles session, recipes, and optionally tag delete */
  function setupUrlBasedFetch(opts: { deleteStatus?: number } = {}) {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (url, reqOpts) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/auth/get-session')) {
        return { ok: true, json: async () => ({ user: { id: 'user-1' } }) } as Response
      }
      if (urlStr.includes('/api/tags/') && (reqOpts as RequestInit)?.method === 'DELETE') {
        return makeDeleteResponse(opts.deleteStatus ?? 204)
      }
      if (urlStr === '/api/recipes') {
        return { ok: true, json: async () => [] } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })
    return fetchMock
  }

  /** Renders RecipePageContent with the sidebar pre-opened (via localStorage) so
   *  the FilterSidebar mock mounts and captures onDeleteTag on first render. */
  async function renderWithSidebar(fetchMock: ReturnType<typeof vi.mocked<typeof fetch>>) {
    render(<RecipePageContent />)
    await waitFor(() => expect(screen.getByTestId('filter-sidebar')).toBeInTheDocument())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/recipes'))
  }

  it('calls DELETE /api/tags/:name', async () => {
    const fetchMock = setupUrlBasedFetch()

    await renderWithSidebar(fetchMock)

    await mockOnDeleteTag('Seafood')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tags/Seafood',
      expect.objectContaining({
        method: 'DELETE',
      }),
    )
  })

  it('refetches /api/recipes after a successful delete', async () => {
    const fetchMock = setupUrlBasedFetch()

    await renderWithSidebar(fetchMock)

    const callsBefore = fetchMock.mock.calls.filter((c) => c[0] === '/api/recipes').length

    await mockOnDeleteTag('Seafood')

    await waitFor(() => {
      const callsAfter = fetchMock.mock.calls.filter((c) => c[0] === '/api/recipes').length
      expect(callsAfter).toBeGreaterThan(callsBefore)
    })
  })

  it('encodes tag names with special characters in the URL', async () => {
    const fetchMock = setupUrlBasedFetch()

    await renderWithSidebar(fetchMock)

    await mockOnDeleteTag('My Custom Tag')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tags/My%20Custom%20Tag',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
