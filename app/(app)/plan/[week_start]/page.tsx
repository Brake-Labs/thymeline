import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getMostRecentSunday, formatWeekRange, addWeeks } from '@/lib/date-utils'
import WeekCalendarView from '@/components/plan/WeekCalendarView'

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
  const maxWeek      = addWeeks(getMostRecentSunday(), 4)
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
      <h1 className="font-display flex-1 text-xl font-bold text-stone-900 text-center">
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
            className="font-display inline-block rounded-lg bg-sage-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sage-600"
          >
            Plan this week
          </Link>
        </div>
      </div>
    )
  }

  const { data: entries } = await supabase
    .from('meal_plan_entries')
    .select('id, planned_date, recipe_id, position, confirmed, meal_type, recipes(title)')
    .eq('meal_plan_id', plan.id)
    .order('planned_date')
    .order('position')

  const enriched = (entries ?? []).map((e) => ({
    id:            e.id,
    planned_date:  e.planned_date,
    recipe_title:  ((e.recipes as unknown) as { title: string } | null)?.title ?? '',
    meal_type:     e.meal_type ?? 'dinner',
    confirmed:     e.confirmed,
  }))

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {weekNav}

      <WeekCalendarView entries={enriched} weekStart={week_start} />

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Link
          href={`/groceries?week_start=${week_start}`}
          className="font-display flex-1 text-center rounded-lg bg-sage-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sage-600"
        >
          Make grocery list
        </Link>
        <Link
          href={`/plan?week_start=${week_start}&replan=true`}
          className="font-display flex-1 text-center rounded-lg border border-stone-300 px-5 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
        >
          Re-plan this week
        </Link>
      </div>
    </div>
  )
}
