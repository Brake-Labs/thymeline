import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { HomeData } from '@/types'

/** Returns the ISO date string for the most recent Monday (start of week). */
function getCurrentWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? 6 : day - 1 // days back to Monday
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - diff)
  return monday.toISOString().slice(0, 10)
}

/** Returns the ISO date string for the most recent Sunday (plan week_start). */
function getMostRecentSunday(): string {
  const now = new Date()
  const sunday = new Date(now)
  sunday.setUTCDate(now.getUTCDate() - now.getUTCDay())
  return sunday.toISOString().slice(0, 10)
}

/** Format ISO date string as "Mon Mar 2" */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

async function getHomeData(): Promise<HomeData> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { currentWeekPlan: null, recentlyMade: [] }

  const weekStart = getCurrentWeekStart()

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

  return { currentWeekPlan, recentlyMade }
}

export default async function HomePage() {
  const { currentWeekPlan, recentlyMade } = await getHomeData()
  const currentSunday = getMostRecentSunday()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">

      {/* This Week */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-stone-800">This Week</h2>
          <Link href={`/plan/${currentSunday}`} className="text-sm text-sage-500 hover:underline">
            View full plan
          </Link>
        </div>

        {currentWeekPlan ? (
          <div className="space-y-2">
            {currentWeekPlan.entries.map((entry) => (
              <div
                key={`${entry.planned_date}-${entry.position}`}
                className="flex items-center justify-between rounded-lg border border-stone-200 px-4 py-3 bg-white"
              >
                <div>
                  <p className="text-xs text-stone-500">{formatDate(entry.planned_date)}</p>
                  <p className="text-sm font-medium text-stone-900">{entry.recipe_title}</p>
                </div>
                {entry.confirmed && (
                  <span className="text-xs text-sage-500 font-medium">✓ Confirmed</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center space-y-3">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/plan',                 label: 'Help Me Plan', icon: '✨' },
            { href: '/recipes',              label: 'Recipe Vault', icon: '📖' },
            { href: '/groceries',            label: 'Groceries',    icon: '🛒' },
            { href: '/settings/preferences', label: 'Settings',     icon: '⚙️' },
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
              <div
                key={`${item.recipe_id}-${item.made_on}`}
                className="flex items-center justify-between rounded-lg border border-stone-200 px-4 py-3 bg-white"
              >
                <span className="text-sm font-medium text-stone-900">{item.recipe_title}</span>
                <span className="text-xs text-stone-500">{formatDate(item.made_on)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
