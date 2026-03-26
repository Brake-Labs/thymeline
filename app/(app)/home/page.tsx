import Link from 'next/link'
import { Sparkles, Archive, ClipboardList } from 'lucide-react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { HomeData } from '@/types'
import { getMostRecentSunday, getTodayISO, getGreetingPhrase, isToday } from './utils'

// ── Formatting helpers ────────────────────────────────────────────────────────

function getDayAbbrev(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  })
}

function getDayNum(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${fmt(start)} \u2013 ${fmt(end)}`
}

function formatTime(minutes: number | null): string | null {
  if (minutes === null) return null
  if (minutes < 60) return `${minutes} min`
  const hrs = minutes / 60
  return Number.isInteger(hrs) ? `${hrs} hr` : `${Math.round(hrs * 10) / 10} hr`
}

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

// ── Section header component ──────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-xs font-semibold tracking-widest uppercase text-stone-500 mb-2">
        {children}
      </h2>
      <hr className="border-stone-200" />
    </div>
  )
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getHomeData(): Promise<HomeData & { weekStart: string }> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const weekStart = getMostRecentSunday()
  if (!user) {
    return { userName: null, recipeCount: 0, groceryListWeekStart: null, currentWeekPlan: null, recentlyMade: [], weekStart }
  }

  const fullName = (user.user_metadata?.full_name as string | undefined) ?? null
  const userName = fullName
    ? fullName.split(' ')[0]
    : (user.email?.split('@')[0] ?? null)

  const [planResult, historyResult, recipeCountResult, groceryResult] = await Promise.all([
    supabase
      .from('meal_plans')
      .select('id, week_start')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .single(),
    supabase
      .from('recipe_history')
      .select('recipe_id, made_on, recipes(title, tags)')
      .eq('user_id', user.id)
      .order('made_on', { ascending: false })
      .limit(5),
    supabase
      .from('recipes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('grocery_lists')
      .select('week_start')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const plan = planResult.data
  let currentWeekPlan: HomeData['currentWeekPlan'] = null

  if (plan) {
    const { data: entries } = await supabase
      .from('meal_plan_entries')
      .select('planned_date, recipe_id, position, confirmed, recipes(title, total_time_minutes)')
      .eq('meal_plan_id', plan.id)
      .order('planned_date')
      .order('position')

    currentWeekPlan = {
      id:         plan.id,
      week_start: plan.week_start,
      entries: (entries ?? []).map((e) => {
        const rec = (e.recipes as unknown) as { title: string; total_time_minutes: number | null } | null
        return {
          planned_date:       e.planned_date,
          recipe_id:          e.recipe_id,
          recipe_title:       rec?.title ?? '',
          position:           e.position,
          confirmed:          e.confirmed,
          total_time_minutes: rec?.total_time_minutes ?? null,
        }
      }),
    }
  }

  type HistRow = { recipe_id: string; made_on: string; recipes: { title: string; tags: string[] } | null }
  const recentlyMade = ((historyResult.data ?? []) as unknown as HistRow[]).map((h) => ({
    recipe_id:    h.recipe_id,
    recipe_title: h.recipes?.title ?? '',
    made_on:      h.made_on,
    tags:         h.recipes?.tags ?? [],
  }))

  return {
    userName,
    recipeCount:          recipeCountResult.count ?? 0,
    groceryListWeekStart: groceryResult.data?.week_start ?? null,
    currentWeekPlan,
    recentlyMade,
    weekStart,
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const { userName, recipeCount, groceryListWeekStart, currentWeekPlan, recentlyMade, weekStart } =
    await getHomeData()

  const today    = getTodayISO()
  const phrase   = getGreetingPhrase(new Date().getUTCHours())
  const weekDays = buildWeekDays(weekStart)

  const entriesByDay = new Map<
    string,
    { recipe_id: string; recipe_title: string; total_time_minutes: number | null }[]
  >()
  if (currentWeekPlan) {
    for (const entry of currentWeekPlan.entries) {
      const list = entriesByDay.get(entry.planned_date) ?? []
      if (!list.find((e) => e.recipe_id === entry.recipe_id)) {
        list.push({
          recipe_id:          entry.recipe_id,
          recipe_title:       entry.recipe_title,
          total_time_minutes: entry.total_time_minutes,
        })
      }
      entriesByDay.set(entry.planned_date, list)
    }
  }

  const daysPlanned = entriesByDay.size

  const quickActions = [
    {
      href:     '/plan',
      label:    'Help Me Plan',
      subtitle: "Generate this week's meals",
      Icon:     Sparkles,
    },
    {
      href:     '/recipes',
      label:    'Recipe Box',
      subtitle: recipeCount > 0 ? `${recipeCount} recipe${recipeCount === 1 ? '' : 's'} saved` : 'Browse your recipes',
      Icon:     Archive,
    },
    {
      href:     '/groceries',
      label:    'Grocery List',
      subtitle: groceryListWeekStart
        ? `${formatShortDate(groceryListWeekStart)} list ready`
        : 'Start fresh',
      Icon:     ClipboardList,
    },
  ]

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8 pb-12">

        {/* Greeting */}
        <h1 className="font-display text-3xl font-bold text-stone-900">
          Good {phrase}{userName ? `, ${userName}` : ''}
        </h1>

        {/* This Week */}
        <section>
          <SectionHeader>This Week</SectionHeader>

          <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="bg-sage-600 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold text-white uppercase tracking-wide">
                Week of {formatShortDate(weekStart)}
              </span>
              <span className="text-sm text-white/70">{formatWeekRange(weekStart)}</span>
            </div>

            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 divide-x divide-stone-100 min-w-[490px]">
                {weekDays.map((day) => {
                  const entries = entriesByDay.get(day) ?? []
                  const todayDay = isToday(day, today)
                  return (
                    <div
                      key={day}
                      data-today={todayDay ? 'true' : undefined}
                      className="p-2.5 min-h-[110px]"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                        {getDayAbbrev(day)}
                      </p>
                      <p
                        className={`text-2xl font-bold mt-0.5 mb-2 ${
                          todayDay ? 'text-sage-500' : 'text-stone-800'
                        }`}
                      >
                        {getDayNum(day)}
                      </p>
                      {entries.length > 0 ? (
                        <div className="space-y-1">
                          {entries.map((e) => (
                            <div
                              key={e.recipe_id}
                              className="rounded bg-sage-50 px-1.5 py-1"
                            >
                              <Link
                                href={`/recipes/${e.recipe_id}`}
                                className="text-[11px] font-medium text-stone-800 hover:text-sage-600 leading-snug block"
                              >
                                {e.recipe_title}
                              </Link>
                              {formatTime(e.total_time_minutes) && (
                                <p className="text-[10px] text-stone-400 mt-0.5">
                                  {formatTime(e.total_time_minutes)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-stone-300 text-base">&#8212;</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div
              data-testid={currentWeekPlan ? undefined : 'empty-plan'}
              className="flex items-center justify-between px-4 py-3 border-t border-dashed border-stone-200"
            >
              <span className="text-sm text-stone-500">{daysPlanned} of 7 days planned</span>
              <Link
                href={`/plan/${weekStart}`}
                className="border border-stone-300 rounded-full px-4 py-1.5 text-sm text-stone-700 hover:bg-stone-100 transition-colors"
              >
                View full plan &#8594;
              </Link>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <SectionHeader>Quick Actions</SectionHeader>
          <div className="grid grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="bg-white rounded-xl border border-stone-200 border-t-2 border-t-sage-500 p-4 hover:bg-stone-50 transition-colors"
              >
                <action.Icon className="w-5 h-5 text-stone-700 mb-3" strokeWidth={1.75} />
                <p className="font-semibold text-stone-900 text-sm leading-snug">{action.label}</p>
                <p className="text-xs text-stone-500 mt-1">{action.subtitle}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* Recently Made */}
        {recentlyMade.length > 0 && (
          <section>
            <SectionHeader>Recently Made</SectionHeader>
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden divide-y divide-stone-100">
              {recentlyMade.map((item) => (
                <Link
                  key={`${item.recipe_id}-${item.made_on}`}
                  href={`/recipes/${item.recipe_id}`}
                  className="flex items-center justify-between px-4 py-4 hover:bg-stone-50 transition-colors"
                >
                  <span className="text-sm font-medium text-stone-900 flex-1 min-w-0 mr-4 truncate">
                    {item.recipe_title}
                  </span>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-xs text-stone-500">{formatShortDate(item.made_on)}</span>
                    {item.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap justify-end">
                        {item.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-sage-100 text-sage-700 rounded-full px-2 py-0.5"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
