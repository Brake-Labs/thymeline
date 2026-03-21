import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentWeekSunday } from '@/lib/grocery'

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n * 7)
  return d.toISOString().slice(0, 10)
}

interface Props {
  params: { week_start: string }
}

export default async function PlanWeekPage({ params }: Props) {
  const { week_start } = params
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Week navigation
  const prevWeek     = addWeeks(week_start, -1)
  const nextWeek     = addWeeks(week_start, 1)
  const maxWeek      = addWeeks(getCurrentWeekSunday(), 4)
  const nextDisabled = nextWeek > maxWeek

  const weekNav = (
    <div className="flex items-center gap-3">
      <Link
        href={`/plan/${prevWeek}`}
        aria-label="Previous week"
        className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors"
      >
        ←
      </Link>
      <h1 className="flex-1 text-xl font-bold text-stone-900 text-center">
        {formatWeekRange(week_start)}
      </h1>
      {nextDisabled ? (
        <span
          aria-label="Next week"
          aria-disabled="true"
          className="p-1.5 rounded-lg text-stone-300 cursor-not-allowed select-none"
        >
          →
        </span>
      ) : (
        <Link
          href={`/plan/${nextWeek}`}
          aria-label="Next week"
          className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors"
        >
          →
        </Link>
      )}
    </div>
  )

  const { data: plan } = await supabase
    .from('meal_plans')
    .select('id, week_start')
    .eq('user_id', user!.id)
    .eq('week_start', week_start)
    .maybeSingle()

  if (!plan) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {weekNav}
        <div className="text-center space-y-4 py-8">
          <p className="text-stone-600 text-lg">No plan for this week.</p>
          <Link
            href={`/plan?week_start=${week_start}`}
            className="inline-block rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Plan this week
          </Link>
        </div>
      </div>
    )
  }

  const { data: entries } = await supabase
    .from('meal_plan_entries')
    .select('planned_date, recipe_id, position, confirmed, recipes(title)')
    .eq('meal_plan_id', plan.id)
    .order('planned_date')
    .order('position')

  const enriched = (entries ?? []).map((e) => ({
    planned_date:  e.planned_date,
    recipe_title:  ((e.recipes as unknown) as { title: string } | null)?.title ?? '',
    confirmed:     e.confirmed,
  }))

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {weekNav}

      {enriched.length === 0 ? (
        <p className="text-stone-500">No recipes planned for this week.</p>
      ) : (
        <div className="space-y-2">
          {enriched.map((entry, i) => (
            <div
              key={`${entry.planned_date}-${i}`}
              className="flex items-center justify-between rounded-lg border border-stone-200 px-4 py-3 bg-white"
            >
              <div>
                <p className="text-xs text-stone-500">{formatDate(entry.planned_date)}</p>
                <p className="text-sm font-medium text-stone-900">{entry.recipe_title}</p>
              </div>
              {entry.confirmed && (
                <span className="text-xs text-emerald-600 font-medium">✓ Confirmed</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Link
          href={`/groceries?week_start=${week_start}`}
          className="flex-1 text-center rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Make grocery list
        </Link>
        <Link
          href={`/plan?week_start=${week_start}&replan=true`}
          className="flex-1 text-center rounded-lg border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
        >
          Re-plan this week
        </Link>
      </div>
    </div>
  )
}
