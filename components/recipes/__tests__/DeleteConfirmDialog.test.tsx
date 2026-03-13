// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DeleteConfirmDialog from '../DeleteConfirmDialog'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
  mockPush.mockReset()
})

// ── Dialog content ────────────────────────────────────────────────────────────

describe('DeleteConfirmDialog - content', () => {
  it('shows confirmation message and both buttons', () => {
    render(
      <DeleteConfirmDialog
        recipeId="recipe-1"
        getToken={async () => 'token'}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Are you sure\? This can't be undone\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})

// ── Cancel ────────────────────────────────────────────────────────────────────

describe('DeleteConfirmDialog - cancel', () => {
  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(
      <DeleteConfirmDialog
        recipeId="recipe-1"
        getToken={async () => 'token'}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not call DELETE when Cancel is clicked', () => {
    render(
      <DeleteConfirmDialog
        recipeId="recipe-1"
        getToken={async () => 'token'}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const deleteCalls = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'DELETE')
    expect(deleteCalls).toHaveLength(0)
  })
})

// ── Confirm delete ────────────────────────────────────────────────────────────

describe('DeleteConfirmDialog - confirm delete', () => {
  it('calls DELETE /api/recipes/[id] with auth header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    render(
      <DeleteConfirmDialog
        recipeId="recipe-1"
        getToken={async () => 'test-token'}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/recipes/recipe-1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        }),
      )
    })
  })

  it('redirects to /recipes on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    render(
      <DeleteConfirmDialog
        recipeId="recipe-1"
        getToken={async () => 'token'}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/recipes')
    })
  })

  it('shows "Deleting…" while the request is in flight', async () => {
    let resolve: (v: unknown) => void
    mockFetch.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    render(
      <DeleteConfirmDialog
        recipeId="recipe-1"
        getToken={async () => 'token'}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('button', { name: 'Deleting…' })).toBeDisabled()
    resolve!({ ok: true })
  })

  it('does not redirect when the request fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    render(
      <DeleteConfirmDialog
        recipeId="recipe-1"
        getToken={async () => 'token'}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })
})
