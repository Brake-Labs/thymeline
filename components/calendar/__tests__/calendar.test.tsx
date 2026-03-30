// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DayCard from '../DayCard'
import MealSlot from '../MealSlot'
import type { PlanEntry } from '@/types'

vi.mock('@/lib/supabase/browser', () => ({
  getAccessToken: async () => 'mock-token',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const DATE = '2026-03-16'

function makeEntry(overrides: Partial<PlanEntry> = {}): PlanEntry {
  return {
    id: 'entry-1',
    recipe_id: 'r1',
    recipe_title: 'Pasta',
    planned_date: DATE,
    meal_type: 'dinner',
    is_side_dish: false,
    parent_entry_id: null,
    confirmed: true,
    position: 1,
    ...overrides,
  }
}

// ── T02: DayCard expand/collapse ──────────────────────────────────────────────

describe('T02 - Clicking a day card expands it; clicking again collapses it', () => {
  it('shows collapsed summary text when not expanded', () => {
    render(
      <DayCard
        date={DATE}
        entries={[makeEntry()]}
        isExpanded={false}
        onToggle={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    expect(screen.getByText('1 meal planned')).toBeInTheDocument()
    // Expanded content not visible
    expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()
  })

  it('calls onToggle when the card header is clicked', () => {
    const onToggle = vi.fn()
    render(
      <DayCard
        date={DATE}
        entries={[]}
        isExpanded={false}
        onToggle={onToggle}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Mar 16/i }))
    expect(onToggle).toHaveBeenCalled()
  })

  it('shows Breakfast, Lunch, Dinner, Snacks slots when expanded', () => {
    render(
      <DayCard
        date={DATE}
        entries={[]}
        isExpanded={true}
        onToggle={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    expect(screen.getByText('Breakfast')).toBeInTheDocument()
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    expect(screen.getByText('Dinner')).toBeInTheDocument()
    expect(screen.getByText('Snacks')).toBeInTheDocument()
  })
})

// ── T04: Expanded card shows 4 meal slots ────────────────────────────────────

describe('T04 - Expanded card shows Breakfast, Lunch, Dinner, Snacks slots', () => {
  it('renders all four meal type sections', () => {
    render(
      <DayCard
        date={DATE}
        entries={[]}
        isExpanded={true}
        onToggle={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    const slots = ['Breakfast', 'Lunch', 'Dinner', 'Snacks']
    slots.forEach((slot) => {
      expect(screen.getByText(slot)).toBeInTheDocument()
    })
  })
})

// ── T19: Empty day shows "Nothing planned" prompt ─────────────────────────────

describe('T19 - Empty week shows "Nothing planned" prompt with link to /plan', () => {
  it('shows the nothing planned prompt with link when expanded and empty', () => {
    render(
      <DayCard
        date={DATE}
        entries={[]}
        isExpanded={true}
        onToggle={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    expect(screen.getAllByText(/Nothing planned/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /Help Me Plan/i })).toHaveAttribute('href', '/plan')
  })
})

// ── T01: DayCard summary text ─────────────────────────────────────────────────

describe('T01 - Day card shows correct summary', () => {
  it('shows "Nothing planned" when no entries', () => {
    render(
      <DayCard
        date={DATE}
        entries={[]}
        isExpanded={false}
        onToggle={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    expect(screen.getByText('Nothing planned')).toBeInTheDocument()
  })

  it('shows "2 meals planned" with two main entries', () => {
    render(
      <DayCard
        date={DATE}
        entries={[
          makeEntry({ id: 'e1', meal_type: 'breakfast' }),
          makeEntry({ id: 'e2', meal_type: 'dinner' }),
        ]}
        isExpanded={false}
        onToggle={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    expect(screen.getByText('2 meals planned')).toBeInTheDocument()
  })

  it('side dishes do not count in the meal count', () => {
    render(
      <DayCard
        date={DATE}
        entries={[
          makeEntry({ id: 'e1', meal_type: 'dinner' }),
          makeEntry({ id: 'e2', is_side_dish: true, parent_entry_id: 'e1', meal_type: 'dinner' }),
        ]}
        isExpanded={false}
        onToggle={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    expect(screen.getByText('1 meal planned')).toBeInTheDocument()
  })
})

// ── T11: "Add side dish" link appears only on Dinner/Lunch with a main ────────

describe('T11 - Add side dish link appears only on Dinner and Lunch with a main dish', () => {
  it('shows "Add side dish" on Dinner slot when main entry exists', () => {
    const entry = makeEntry({ meal_type: 'dinner' })
    render(
      <MealSlot
        mealType="dinner"
        entries={[entry]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    expect(screen.getByText('Add side dish')).toBeInTheDocument()
  })

  it('shows "Add side dish" on Lunch slot when main entry exists', () => {
    const entry = makeEntry({ meal_type: 'lunch' })
    render(
      <MealSlot
        mealType="lunch"
        entries={[entry]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    expect(screen.getByText('Add side dish')).toBeInTheDocument()
  })

  it('does NOT show "Add side dish" on Breakfast slot', () => {
    const entry = makeEntry({ meal_type: 'breakfast' })
    render(
      <MealSlot
        mealType="breakfast"
        entries={[entry]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    expect(screen.queryByText('Add side dish')).not.toBeInTheDocument()
  })

  it('does NOT show "Add side dish" on Snacks slot', () => {
    const entry = makeEntry({ meal_type: 'snack' })
    render(
      <MealSlot
        mealType="snack"
        entries={[entry]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    expect(screen.queryByText('Add side dish')).not.toBeInTheDocument()
  })

  it('does NOT show "Add side dish" when no main entry exists', () => {
    render(
      <MealSlot
        mealType="dinner"
        entries={[]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    expect(screen.queryByText('Add side dish')).not.toBeInTheDocument()
  })
})

// ── T13: Side dish appears indented under parent ──────────────────────────────

describe('T13 - Side dish appears indented under its parent main dish', () => {
  it('renders side dish recipe title in the slot', () => {
    const main = makeEntry({ id: 'e1', meal_type: 'dinner', recipe_title: 'Chicken' })
    const side = makeEntry({ id: 'e2', meal_type: 'dinner', is_side_dish: true, parent_entry_id: 'e1', recipe_title: 'Rice' })
    render(
      <MealSlot
        mealType="dinner"
        entries={[main, side]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    expect(screen.getByText('Chicken')).toBeInTheDocument()
    expect(screen.getByText('Rice')).toBeInTheDocument()
  })
})

// ── T10: × button calls onDelete ──────────────────────────────────────────────

describe('T10 - × button on a recipe calls onDelete', () => {
  it('calls onDelete with the entry id when × is clicked', async () => {
    const onDelete = vi.fn()
    const entry = makeEntry({ id: 'entry-1', recipe_title: 'Pasta' })
    render(
      <MealSlot
        mealType="dinner"
        entries={[entry]}
        onAdd={vi.fn()}
        onDelete={onDelete}
        onAddSideDish={vi.fn()}
      />
    )
    // Hover to reveal the × button (it's hidden by default)
    const deleteBtn = screen.getByRole('button', { name: /Remove Pasta/ })
    fireEvent.click(deleteBtn)
    expect(onDelete).toHaveBeenCalledWith('entry-1')
  })
})

// ── T-TIME: MealSlot shows total_time_minutes when present ────────────────────

describe('MealSlot - recipe time display', () => {
  it('renders formatted time next to recipe name when total_time_minutes is present', () => {
    const entry = makeEntry({ total_time_minutes: 45 })
    render(
      <MealSlot
        mealType="dinner"
        entries={[entry]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    expect(screen.getByText('· 45 min')).toBeInTheDocument()
  })

  it('renders nothing for time when total_time_minutes is null', () => {
    const entry = makeEntry({ total_time_minutes: null })
    render(
      <MealSlot
        mealType="dinner"
        entries={[entry]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    expect(screen.queryByText(/min/)).not.toBeInTheDocument()
  })
})

// ── T21: Existing dinner-only plan renders correctly ──────────────────────────

describe('T21 - Existing dinner-only plans render correctly in Dinner slot', () => {
  it('renders a dinner entry in the Dinner meal slot', () => {
    const entry = makeEntry({ meal_type: 'dinner', recipe_title: 'Pasta Primavera' })
    render(
      <DayCard
        date={DATE}
        entries={[entry]}
        isExpanded={true}
        onToggle={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
      />
    )
    expect(screen.getByText('Pasta Primavera')).toBeInTheDocument()
  })
})
