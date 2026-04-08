// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import DayCard from '../DayCard'
import MealSlot from '../MealSlot'
import WeekCalendar from '../WeekCalendar'
import type { PlanEntry } from '@/types'
import { getMostRecentSunday, addDays } from '@/lib/date-utils'


vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))

vi.mock('next/link', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: any }) => (
    <a href={href} {...rest}>{children}</a>
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

  it('includes week_start in the Help Me Plan link when weekStart is provided (regression #322)', () => {
    render(
      <DayCard
        date={DATE}
        entries={[]}
        isExpanded={true}
        onToggle={vi.fn()}
        onAddEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
        weekStart="2026-03-15"
      />
    )
    expect(screen.getByRole('link', { name: /Help Me Plan/i })).toHaveAttribute(
      'href',
      '/plan?week_start=2026-03-15',
    )
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

// ── T-COOK-LINK: Cook link uses correct route (regression #242) ───────────────

describe('MealSlot - Cook link routes to correct cook-mode URL (regression #242)', () => {
  it('single-entry Cook link routes to /recipes/:id/cook (not /cook/recipes/...)', () => {
    const entry = makeEntry({ recipe_id: 'abc-123', meal_type: 'dinner' })
    render(
      <MealSlot
        mealType="dinner"
        date={DATE}
        entries={[entry]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    const link = screen.getByRole('link', { name: /cook dinner/i })
    expect(link).toHaveAttribute('href', '/recipes/abc-123/cook')
  })

  it('multi-entry Cook link routes to /meal/:date (not /cook/meal/...)', () => {
    const e1 = makeEntry({ id: 'e1', recipe_id: 'r1', meal_type: 'dinner', recipe_title: 'Pasta' })
    const e2 = makeEntry({ id: 'e2', recipe_id: 'r2', meal_type: 'dinner', recipe_title: 'Tacos' })
    render(
      <MealSlot
        mealType="dinner"
        date={DATE}
        entries={[e1, e2]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    const link = screen.getByRole('link', { name: /cook dinner/i })
    expect(link).toHaveAttribute('href', `/meal/${DATE}?meal_type=dinner`)
  })
})

// ── T-SIDE-DISH-COOK: Side dish routes to multi-recipe cook (regression #245) ─

describe('MealSlot - Cook link routes to /meal when a side dish is present (regression #245)', () => {
  it('routes to /meal/:date?meal_type when main entry has a non-dessert side dish', () => {
    const main = makeEntry({ id: 'e1', recipe_id: 'main-1', meal_type: 'dinner', is_side_dish: false })
    const side = makeEntry({ id: 'e2', recipe_id: 'side-1', meal_type: 'dinner', is_side_dish: true, parent_entry_id: 'e1', recipe_title: 'Garlic Bread' })
    render(
      <MealSlot
        mealType="dinner"
        date={DATE}
        entries={[main, side]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    const link = screen.getByRole('link', { name: /cook dinner/i })
    expect(link).toHaveAttribute('href', `/meal/${DATE}?meal_type=dinner`)
  })

  it('still routes to /recipes/:id/cook when main entry has only a dessert (no cookable side)', () => {
    const main = makeEntry({ id: 'e1', recipe_id: 'main-1', meal_type: 'dinner', is_side_dish: false })
    const dessert = makeEntry({ id: 'e2', recipe_id: 'dessert-1', meal_type: 'dessert', is_side_dish: true, parent_entry_id: 'e1', recipe_title: 'Ice Cream' })
    render(
      <MealSlot
        mealType="dinner"
        date={DATE}
        entries={[main, dessert]}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAddSideDish={vi.fn()}
      />
    )
    const link = screen.getByRole('link', { name: /cook dinner/i })
    expect(link).toHaveAttribute('href', '/recipes/main-1/cook')
  })
})

// ── T-FUTURE-EXPAND: Future weeks start expanded (regression #247) ────────────

describe('WeekCalendar - future weeks are expanded on navigation (regression #247)', () => {
  it('shows meal type slots (expanded) after navigating to next week', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ plan: null }),
    })) as unknown as typeof fetch

    render(<WeekCalendar />)

    // Current week starts expanded — Dinner labels are visible
    await waitFor(() => expect(screen.getAllByText('Dinner').length).toBeGreaterThan(0))

    // Navigate to next week
    fireEvent.click(screen.getByRole('button', { name: /next week/i }))

    // Next week should also be expanded — Dinner labels still visible
    await waitFor(() => expect(screen.getAllByText('Dinner').length).toBeGreaterThan(0))
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

// ── T-SWAP: Swap meals on WeekCalendar (regression #303) ─────────────────────

describe('WeekCalendar - swap meals (regression #303)', () => {
  // Use dates within the current week so entries appear in DayCards
  const weekStart = getMostRecentSunday()
  const monday = addDays(weekStart, 1)
  const wednesday = addDays(weekStart, 3)

  const swapEntries = [
    { id: 'e1', recipe_id: 'r1', recipe_title: 'Pasta',  planned_date: monday,    meal_type: 'dinner', is_side_dish: false, parent_entry_id: null, confirmed: false, position: 1, total_time_minutes: null },
    { id: 'e2', recipe_id: 'r2', recipe_title: 'Tacos',  planned_date: wednesday, meal_type: 'dinner', is_side_dish: false, parent_entry_id: null, confirmed: false, position: 1, total_time_minutes: null },
  ]

  beforeEach(() => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })            // prefs
      .mockResolvedValueOnce({ ok: true, json: async () => ({              // plan
        plan: { id: 'plan-1', week_start: weekStart, entries: swapEntries },
      }) })
      .mockResolvedValue({ ok: true, json: async () => ({                  // swap + any subsequent
        entry_a: { id: 'e1', planned_date: wednesday, recipe_id: 'r1' },
        entry_b: { id: 'e2', planned_date: monday,    recipe_id: 'r2' },
      }) })
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('shows Swap meals button when ≥2 entries exist', async () => {
    render(<WeekCalendar />)
    await waitFor(() => expect(screen.getByText('Swap meals')).toBeInTheDocument())
  })

  it('calls POST /api/plan/swap with correct IDs when two meals are tapped', async () => {
    render(<WeekCalendar />)
    await waitFor(() => expect(screen.getByText('Swap meals')).toBeInTheDocument())

    // Enter swap mode
    fireEvent.click(screen.getByText('Swap meals'))
    expect(screen.getByText('Tap a meal to select it')).toBeInTheDocument()

    // Tap first meal (Pasta)
    const pasta = screen.getByText('Pasta')
    fireEvent.click(pasta.closest('div[class*="rounded-r"]')!)

    // Banner should update
    expect(screen.getByText('Now tap a meal to swap with')).toBeInTheDocument()

    // Tap second meal (Tacos)
    const tacos = screen.getByText('Tacos')
    await act(async () => {
      fireEvent.click(tacos.closest('div[class*="rounded-r"]')!)
    })

    // Verify swap API was called with the correct entry IDs
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    const swapCall = fetchMock.mock.calls.find(
      (args: unknown[]) => typeof args[0] === 'string' && args[0] === '/api/plan/swap'
    )
    expect(swapCall).toBeDefined()
    const body = JSON.parse((swapCall![1] as RequestInit).body as string)
    expect(body).toEqual({ entry_id_a: 'e1', entry_id_b: 'e2' })
  })

  it('shows SwapToast after a successful swap', async () => {
    render(<WeekCalendar />)
    await waitFor(() => expect(screen.getByText('Swap meals')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Swap meals'))
    fireEvent.click(screen.getByText('Pasta').closest('div[class*="rounded-r"]')!)
    await act(async () => {
      fireEvent.click(screen.getByText('Tacos').closest('div[class*="rounded-r"]')!)
    })

    await waitFor(() => expect(screen.getByText('Meals swapped ✓')).toBeInTheDocument())
  })

  it('shows error message and reverts entries on API failure', async () => {
    // Replace the mock entirely so beforeEach's queued responses don't interfere
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })            // prefs
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        plan: { id: 'plan-1', week_start: weekStart, entries: swapEntries },
      }) })
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Swap failed' }) })

    render(<WeekCalendar />)
    await waitFor(() => expect(screen.getByText('Swap meals')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Swap meals'))
    fireEvent.click(screen.getByText('Pasta').closest('div[class*="rounded-r"]')!)
    await act(async () => {
      fireEvent.click(screen.getByText('Tacos').closest('div[class*="rounded-r"]')!)
    })

    await waitFor(() => expect(screen.getByText('Swap failed. Please try again.')).toBeInTheDocument())
  })

  // Regression #318 (part 2): side dish must follow its parent in the optimistic UI update.
  // Before the fix the optimistic setEntries only moved the two tapped entries.
  // DayCard filters side dishes by checking whether their parent is present in
  // the same day's entries — so an unmoved side dish disappeared from both days.
  it('side dish moves with its parent in the optimistic update', async () => {
    const thursday = addDays(weekStart, 4)
    const entriesWithSide = [
      { id: 'e1', recipe_id: 'r1', recipe_title: 'Chicken', planned_date: monday,   meal_type: 'dinner', is_side_dish: false, parent_entry_id: null, confirmed: true, position: 1, total_time_minutes: null },
      { id: 'e3', recipe_id: 'r3', recipe_title: 'Broccoli', planned_date: monday,  meal_type: 'dinner', is_side_dish: true,  parent_entry_id: 'e1', confirmed: true, position: 1, total_time_minutes: null },
      { id: 'e2', recipe_id: 'r2', recipe_title: 'Tacos',   planned_date: thursday, meal_type: 'dinner', is_side_dish: false, parent_entry_id: null, confirmed: true, position: 1, total_time_minutes: null },
    ]

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })           // prefs
      .mockResolvedValueOnce({ ok: true, json: async () => ({              // plan
        plan: { id: 'plan-1', week_start: weekStart, entries: entriesWithSide },
      }) })
      .mockResolvedValue({ ok: true, json: async () => ({                  // swap
        entry_a: { id: 'e1', planned_date: thursday, recipe_id: 'r1' },
        entry_b: { id: 'e2', planned_date: monday,   recipe_id: 'r2' },
      }) })

    render(<WeekCalendar />)
    // All DayCards start expanded; wait for entries to load
    await waitFor(() => expect(screen.getByText('Chicken')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Broccoli')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Swap meals')).toBeInTheDocument())

    // Swap Chicken (Monday) with Tacos (Thursday)
    fireEvent.click(screen.getByText('Swap meals'))
    fireEvent.click(screen.getByText('Chicken').closest('div[class*="rounded-r"]')!)
    await act(async () => {
      fireEvent.click(screen.getByText('Tacos').closest('div[class*="rounded-r"]')!)
    })

    // After the optimistic update Broccoli must still be visible (it moved to Thursday with Chicken)
    await waitFor(() => expect(screen.getByText('Broccoli')).toBeInTheDocument())
  })
})
