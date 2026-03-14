// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RecipeForm from '../RecipeForm'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

// TagSelector fetches tags on mount — stub fetch so it doesn't blow up in jsdom
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ firstClass: [], custom: [] }),
}))

const baseProps = {
  onSubmit: vi.fn(),
  isSubmitting: false,
}

describe('RecipeForm — availableTags guard', () => {
  it('renders without error when availableTags prop is undefined', () => {
    expect(() =>
      render(<RecipeForm {...baseProps} availableTags={undefined} />),
    ).not.toThrow()
    expect(screen.getByRole('button', { name: 'Save Recipe' })).toBeInTheDocument()
  })

  it('renders without error when availableTags prop is not provided', () => {
    expect(() =>
      render(<RecipeForm {...baseProps} />),
    ).not.toThrow()
    expect(screen.getByRole('button', { name: 'Save Recipe' })).toBeInTheDocument()
  })

  it('renders without error when availableTags is an empty array (initial loading state)', () => {
    expect(() =>
      render(<RecipeForm {...baseProps} availableTags={[]} />),
    ).not.toThrow()
  })
})
