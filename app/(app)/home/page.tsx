import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { HomeData } from '@/types'
import { getMostRecentSunday, getTodayISO, getGreetingPhrase, isToday } from './utils'

/** Format ISO date as day name abbrev, e.g. "Mon". */
function getDayAbbrev(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

/** Format ISO date as "Mar 3". */
function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Format ISO date as "Mon Mar 3" for recently made list. */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Build the 7-day array starting from weekStart. */
function buildWeekDays(weekStart: string): string[] {
  const days: string[] = []
  const base = new Date(`${weekStart}T00:00:00Z`)
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setUTCDate(base.getUTCDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

async function getHomeData(): Promise<HomeData & { weekStart: string }> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { userName: null, currentWeekPlan: null, recentlyMade: [], weekStart: getMostRecentSunday() }

  const weekStart = getMostRecentSunday()

  // User display name from metadata or email
  const fullName: string | null =
    (user.user_metadata?.full_name as string | undefined) ?? null
  const userName = fullName
    ? fullName.split(' ')[0]
    : (user.email?.split('@')[0] ?? null)

  // Fetch current week's meal plan
  const { data: plan } = await supabase
    .from('meal_plans')
    .select('id, week_start')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .single()

  let currentWeekPlan: HomeData['currentWeekPlan'] = null

  if (plan) {
    const { data: entries } = await supabase
      .from('meal_plan_entries')
      .select('planned_date, recipe_id, position, confirmed, recipes(title)')
      .eq('meal_plan_id', plan.id)
      .order('planned_date')
      .order('position')

    currentWeekPlan = {
      id: plan.id,
      week_start: plan.week_start,
      entries: (entries ?? []).map((e) => ({
        planned_date:  e.planned_date,
        recipe_id:     e.recipe_id,
        recipe_title:  ((e.recipes as unknown) as { title: string } | null)?.title ?? '',
        position:      e.position,
        confirmed:     e.confirmed,
      })),
    }
  }

  // Fetch last 3 recently made recipes
  const { data: history } = await supabase
    .from('recipe_history')
    .select('recipe_id, made_on, recipes(title)')
    .eq('user_id', user.id)
    .order('made_on', { ascending: false })
    .limit(3)

  const recentlyMade = (history ?? []).map((h) => ({
    recipe_id:    h.recipe_id,
    recipe_title: ((h.recipes as unknown) as { title: string } | null)?.title ?? '',
    made_on:      h.made_on,
  }))

  return { userName, currentWeekPlan, recentlyMade, weekStart }
}

export default async function HomePage() {
  const { userName, currentWeekPlan, recentlyMade, weekStart } = await getHomeData()
  const today = getTodayISO()
  const hourUTC = new Date().getUTCHours()
  const phrase = getGreetingPhrase(hourUTC)
  const weekDays = buildWeekDays(weekStart)

  // Group entries by planned_date
  const entriesByDay = new Map<string, { recipe_id: string; recipe_title: string; confirmed: boolean }[]>()
  if (currentWeekPlan) {
    for (const entry of currentWeekPlan.entries) {
      const list = entriesByDay.get(entry.planned_date) ?? []
      list.push({ recipe_id: entry.recipe_id, recipe_title: entry.recipe_title, confirmed: entry.confirmed })
      entriesByDay.set(entry.planned_date, list)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">

      {/* Greeting */}
      <section>
        <h1 className="font-display text-2xl font-bold text-[#1F2D26]">
          Good {phrase}{userName ? `, ${userName}` : ''}!
        </h1>
      </section>

      {/* This Week */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-stone-800">This Week</h2>
          <Link href={`/plan/${weekStart}`} className="text-sm text-sage-500 hover:underline">
            View full plan →
          </Link>
        </div>

        {currentWeekPlan ? (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 gap-2 min-w-[560px]">
              {weekDays.map((day) => {
                const entries = entriesByDay.get(day) ?? []
                const todayDay = isToday(day, today)
                return (
                  <div
                    key={day}
                    data-today={todayDay ? 'true' : undefined}
                    className={`rounded-lg border p-2 min-h-[80px] ${
                      todayDay
                        ? 'border-sage-500 bg-sage-50 ring-1 ring-sage-400'
                        : 'border-stone-200 bg-white'
                    }`}
                  >
                    <p className={`text-xs font-semibold mb-0.5 ${todayDay ? 'text-sage-600' : 'text-stone-500'}`}>
                      {getDayAbbrev(day)}
                    </p>
                    <p className={`text-xs mb-1.5 ${todayDay ? 'text-sage-600' : 'text-stone-400'}`}>
                      {formatShortDate(day).split(' ')[1]}
                    </p>
                    <div className="space-y-1">
                      {entries.map((e) => (
                        <Link
                          key={e.recipe_id}
                          href={`/recipes/${e.recipe_id}`}
                          className="block text-[11px] leading-tight text-stone-700 hover:text-sage-600 truncate"
                          title={e.recipe_title}
                        >
                          {e.recipe_title}
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div
            data-testid="empty-plan"
            className="rounded-xl border border-stone-200 bg-white p-6 text-center space-y-3"
          >
            <p className="text-stone-600">No plan yet this week — want to plan your meals?</p>
            <Link
              href="/plan"
              className="font-display inline-block rounded-lg bg-sage-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sage-600"
            >
              Help Me Plan
            </Link>
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="font-display text-lg font-semibold text-stone-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { href: '/plan',      label: 'Help Me Plan', icon: '✨' },
            { href: '/recipes',   label: 'Recipe Box',   icon: '📖' },
            { href: '/groceries', label: 'Groceries',    icon: '🛒' },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex flex-col items-center gap-3 rounded-xl border border-stone-200 p-6 hover:bg-stone-50 transition-colors text-center"
            >
              <span className="text-3xl" aria-hidden="true">{action.icon}</span>
              <span className="text-sm font-semibold text-stone-800">{action.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recently Made — hidden if no history */}
      {recentlyMade.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-stone-800">Recently Made</h2>
            <Link href="/recipes" className="text-sm text-sage-500 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {recentlyMade.map((item) => (
              <Link
                key={`${item.recipe_id}-${item.made_on}`}
                href={`/recipes/${item.recipe_id}`}
                className="flex items-center justify-between rounded-lg border border-stone-200 px-4 py-3 bg-white hover:bg-stone-50 transition-colors"
              >
                <span className="text-sm font-medium text-stone-900">{item.recipe_title}</span>
                <span className="text-xs text-stone-500">{formatDate(item.made_on)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
