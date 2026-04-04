// @vitest-environment jsdom
/**
 * Tests for ExpiryBadge component.
 * Covers spec-12 test cases: T11, T12, T13
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ExpiryBadge from '../ExpiryBadge'

afterEach(() => cleanup())

// Fix "today" so tests are deterministic
const TODAY = '2026-03-26'
vi.setSystemTime(new Date(TODAY + 'T12:00:00Z'))

// ── T11: Items expiring within 3 days show amber badge ────────────────────────

describe('T11 - Items expiring within 3 days show amber ExpiryBadge', () => {
  it('shows amber badge for item expiring in 2 days', () => {
    render(<ExpiryBadge expiry_date="2026-03-28" />)
    const badge = screen.getByText(/expires in 2 days/i)
    expect(badge).toBeDefined()
    expect(badge.className).toContain('bg-amber')
  })

  it('shows "Expires today" for item expiring today', () => {
    render(<ExpiryBadge expiry_date="2026-03-26" />)
    const badge = screen.getByText(/expires today/i)
    expect(badge).toBeDefined()
    expect(badge.className).toContain('bg-amber')
  })

  it('shows amber badge for item expiring in exactly 3 days', () => {
    render(<ExpiryBadge expiry_date="2026-03-29" />)
    const badge = screen.getByText(/expires in 3 days/i)
    expect(badge).toBeDefined()
    expect(badge.className).toContain('bg-amber')
  })
})

// ── T12: Items past expiry show red badge ────────────────────────────────────

describe('T12 - Items past expiry show red ExpiryBadge with "Expired X days ago"', () => {
  it('shows red badge for item expired 1 day ago', () => {
    render(<ExpiryBadge expiry_date="2026-03-25" />)
    const badge = screen.getByText(/expired 1 day ago/i)
    expect(badge).toBeDefined()
    expect(badge.className).toContain('bg-red')
  })

  it('shows red badge for item expired 5 days ago', () => {
    render(<ExpiryBadge expiry_date="2026-03-21" />)
    const badge = screen.getByText(/expired 5 days ago/i)
    expect(badge).toBeDefined()
    expect(badge.className).toContain('bg-red')
  })
})

// ── T13: Items with no expiry date render no badge ────────────────────────────

describe('T13 - Items with no expiry date render no badge', () => {
  it('renders nothing when expiry_date is null', () => {
    const { container } = render(<ExpiryBadge expiry_date={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when expiry is far in the future (fresh)', () => {
    const { container } = render(<ExpiryBadge expiry_date="2027-01-01" />)
    expect(container.firstChild).toBeNull()
  })
})
