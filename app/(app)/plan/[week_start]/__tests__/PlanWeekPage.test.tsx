// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// ── Mock state ─────────────────────────────────────────────────────────────────

const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  plan: null as { id: string; week_start: string } | null,
  entries: [] as { planned_date: string; recipe_id: string; position: number; confirmed: boolean; recipes: { title: string } | null }[],
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockState.user }, error: null }),
    },
    from: (table: string) => {
      if (table === 'meal_plans') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockState.plan, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'meal_plan_entries') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: async () => ({ data: mockState.entries, error: null }),
              }),
            }),
          }),
        }
      }
      return {}
    },
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

// Fixed current Sunday so cap tests are deterministic
vi.mock('@/lib/grocery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/grocery')>()
  return { ...actual, getCurrentWeekSunday: () => '2026-03-15' }
})

import PlanWeekPage from '../page'
import * as nextNavigation from 'next/navigation'

const WEEK_START = '2026-03-01'

beforeEach(() => {
  mockState.user = { id: 'user-1' }
  mockState.plan = null
  mockState.entries = []
  vi.mocked(nextNavigation.notFound).mockClear()
})

// ── T36: Saved plan renders recipe entries ─────────────────────────────────────

describe('T36 - /plan/[week_start] renders saved plan entries', () => {
  it('shows each recipe title and day when a plan exists', async () => {
    mockState.plan = { id: 'plan-1', week_start: WEEK_START }
    mockState.entries = [
      { planned_date: '2026-03-01', recipe_id: 'r1', position: 1, confirmed: true,  recipes: { title: 'Pasta' } },
      { planned_date: '2026-03-03', recipe_id: 'r2', position: 1, confirmed: false, recipes: { title: 'Tacos' } },
    ]

    const element = await PlanWeekPage({ params: { week_start: WEEK_START } })
    render(element as React.ReactElement)

    expect(screen.getByText('Pasta')).toBeInTheDocument()
    expect(screen.getByText('Tacos')).toBeInTheDocument()
    // Confirmed entry shows checkmark
    expect(screen.getByText('✓ Confirmed')).toBeInTheDocument()
  })

  it('shows "Make grocery list" and "Re-plan this week" buttons', async () => {
    mockState.plan = { id: 'plan-1', week_start: WEEK_START }
    mockState.entries = [
      { planned_date: '2026-03-01', recipe_id: 'r1', position: 1, confirmed: true, recipes: { title: 'Pasta' } },
    ]

    const element = await PlanWeekPage({ params: { week_start: WEEK_START } })
    render(element as React.ReactElement)

    const groceriesLink = screen.getByText('Make grocery list')
    expect(groceriesLink).toBeInTheDocument()
    expect(groceriesLink.closest('a')).toHaveAttribute('href', `/groceries?week_start=${WEEK_START}`)

    const replanLink = screen.getByText('Re-plan this week')
    expect(replanLink).toBeInTheDocument()
    expect(replanLink.closest('a')).toHaveAttribute('href', `/plan?week_start=${WEEK_START}&replan=true`)
  })
})

// ── T37: No plan state renders correctly ──────────────────────────────────────

describe('T37 - /plan/[week_start] shows no-plan state when plan does not exist', () => {
  it('shows "No plan for this week" and a "Plan this week" link', async () => {
    mockState.plan = null

    const element = await PlanWeekPage({ params: { week_start: WEEK_START } })
    render(element as React.ReactElement)

    expect(screen.getByText('No plan for this week.')).toBeInTheDocument()

    const planLink = screen.getByText('Plan this week')
    expect(planLink).toBeInTheDocument()
    expect(planLink.closest('a')).toHaveAttribute('href', `/plan?week_start=${WEEK_START}`)
  })

  it('does not show grocery or re-plan buttons when no plan exists', async () => {
    mockState.plan = null

    const element = await PlanWeekPage({ params: { week_start: WEEK_START } })
    render(element as React.ReactElement)

    expect(screen.queryByText('Make grocery list')).not.toBeInTheDocument()
    expect(screen.queryByText('Re-plan this week')).not.toBeInTheDocument()
  })
})

// ── T39: Week navigation arrows ───────────────────────────────────────────────
// getCurrentWeekSunday mocked to '2026-03-15', so maxWeek = '2026-04-12'

describe('T39 - Week navigation arrows render and respect the 4-week future cap', () => {
  it('renders prev and next arrow links when within the future cap', async () => {
    // week_start = '2026-03-15', nextWeek = '2026-03-22' < maxWeek '2026-04-12'
    const element = await PlanWeekPage({ params: { week_start: '2026-03-15' } })
    render(element as React.ReactElement)

    const prevLink = screen.getByRole('link', { name: 'Previous week' })
    expect(prevLink).toHaveAttribute('href', '/plan/2026-03-08')

    const nextLink = screen.getByRole('link', { name: 'Next week' })
    expect(nextLink).toHaveAttribute('href', '/plan/2026-03-22')
  })

  it('disables the right arrow when nextWeek would exceed the 4-week cap', async () => {
    // week_start = '2026-04-12' = maxWeek, nextWeek = '2026-04-19' > maxWeek
    const element = await PlanWeekPage({ params: { week_start: '2026-04-12' } })
    render(element as React.ReactElement)

    // Prev arrow is still a link
    const prevLink = screen.getByRole('link', { name: 'Previous week' })
    expect(prevLink).toHaveAttribute('href', '/plan/2026-04-05')

    // Next arrow is not a link — it is a disabled span
    expect(screen.queryByRole('link', { name: 'Next week' })).not.toBeInTheDocument()
    const disabledNext = screen.getByLabelText('Next week')
    expect(disabledNext).toHaveAttribute('aria-disabled', 'true')
  })
})
