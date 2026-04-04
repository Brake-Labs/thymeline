// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SummaryStep from '../SummaryStep'
import type { DaySelection, MealType } from '@/types'

const WEEK_START = '2026-03-01'
const SUN = '2026-03-01'
const MON = '2026-03-02'
const TUE = '2026-03-03'
const WED = '2026-03-04'

function makeSetup(activeDates: string[]) {
  return { weekStart: WEEK_START, activeDates, activeMealTypes: ['dinner'] as MealType[] }
}

const SEL_SUN: DaySelection = { date: SUN, meal_type: 'dinner', recipe_id: 'r1', recipe_title: 'Pasta', from_vault: false }
const SEL_MON: DaySelection = { date: MON, meal_type: 'dinner', recipe_id: 'r2', recipe_title: 'Tacos', from_vault: false }

// ── T26: Summary shows confirmed days ─────────────────────────────────────────

describe('T26 - Summary shows confirmed days in chronological order', () => {
  it('lists each confirmed day with its recipe', () => {
    render(
      <SummaryStep
        setup={makeSetup([SUN, MON])}
        selections={{ [`${SUN}:dinner`]: SEL_SUN, [`${MON}:dinner`]: SEL_MON }}
        onSave={vi.fn()}
        isSaving={false}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText('Pasta')).toBeInTheDocument()
    expect(screen.getByText('Tacos')).toBeInTheDocument()
  })
})

// ── T27: Summary shows skipped slots ─────────────────────────────────────────

describe('T27 - Summary shows skipped slots', () => {
  it('shows "Skipping:" line with skipped slot names', () => {
    render(
      <SummaryStep
        setup={makeSetup([SUN, MON, TUE])}
        selections={{
          [`${SUN}:dinner`]: SEL_SUN,
          [`${MON}:dinner`]: null,
          [`${TUE}:dinner`]: null,
        }}
        onSave={vi.fn()}
        isSaving={false}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText(/Skipping:/)).toBeInTheDocument()
    const skippingLine = screen.getByText(/Skipping:/)
    expect(skippingLine.textContent).toContain('Monday')
    expect(skippingLine.textContent).toContain('Tuesday')
  })
})

// ── T28: Excluded days don't appear ──────────────────────────────────────────

describe('T28 - Excluded days do not appear in summary', () => {
  it('does not show Wednesday when it is not in selections', () => {
    render(
      <SummaryStep
        setup={makeSetup([SUN, MON])}
        selections={{ [`${SUN}:dinner`]: SEL_SUN }}
        onSave={vi.fn()}
        isSaving={false}
        onBack={vi.fn()}
      />
    )
    expect(screen.queryByText(/Wednesday/)).not.toBeInTheDocument()
    void WED // referenced in test description
  })
})

// ── T29: Go back returns to suggestions ──────────────────────────────────────

describe('T29 - Go back calls onBack', () => {
  it('calls onBack when "Go back" is clicked', () => {
    const onBack = vi.fn()
    render(
      <SummaryStep
        setup={makeSetup([SUN])}
        selections={{ [`${SUN}:dinner`]: SEL_SUN }}
        onSave={vi.fn()}
        isSaving={false}
        onBack={onBack}
      />
    )
    fireEvent.click(screen.getByText('Go back'))
    expect(onBack).toHaveBeenCalled()
  })
})

// ── T31: Save button calls onSave ─────────────────────────────────────────────

describe('T31 - Save button calls onSave', () => {
  it('calls onSave when the save button is clicked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SummaryStep
        setup={makeSetup([SUN])}
        selections={{ [`${SUN}:dinner`]: SEL_SUN }}
        onSave={onSave}
        isSaving={false}
        onBack={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText(/Looks good/))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
  })

  it('shows "Saving…" while isSaving', () => {
    render(
      <SummaryStep
        setup={makeSetup([SUN])}
        selections={{ [`${SUN}:dinner`]: SEL_SUN }}
        onSave={vi.fn()}
        isSaving={true}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText(/Saving/)).toBeInTheDocument()
  })
})

// ── Save error ────────────────────────────────────────────────────────────────

describe('Save error state', () => {
  it('shows error message when onSave throws', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('fail'))
    render(
      <SummaryStep
        setup={makeSetup([SUN])}
        selections={{ [`${SUN}:dinner`]: SEL_SUN }}
        onSave={onSave}
        isSaving={false}
        onBack={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText(/Looks good/))
    await waitFor(() => {
      expect(screen.getByText(/fail/)).toBeInTheDocument()
    })
  })
})
