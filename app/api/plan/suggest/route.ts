import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import {
  getSeason,
  isSunday,
  fetchCooldownFilteredRecipes,
  fetchRecentHistory,
  fetchUserPreferences,
  buildSystemMessage,
  buildFullWeekUserMessage,
  validateSuggestions,
  callLLMNonStreaming,
} from '../helpers'
import type { DaySuggestions } from '@/types'

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    week_start: string
    active_dates: string[]
    prefer_this_week: string[]
    avoid_this_week: string[]
    free_text: string
    specific_requests: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { week_start, active_dates, prefer_this_week, avoid_this_week, free_text, specific_requests } = body

  if (!active_dates || active_dates.length === 0) {
    return NextResponse.json({ error: 'active_dates must be non-empty' }, { status: 400 })
  }
  if (!isSunday(week_start)) {
    return NextResponse.json({ error: 'week_start must be a Sunday' }, { status: 400 })
  }

  const prefs = await fetchUserPreferences(supabase, user.id)
  const cooldownDays = prefs?.cooldown_days ?? 28
  const recipes = await fetchCooldownFilteredRecipes(supabase, user.id, cooldownDays)
  const recentHistory = await fetchRecentHistory(supabase, user.id)

  console.log(`[suggest] user=${user.id} recipes_after_cooldown=${recipes.length} cooldown_days=${cooldownDays}`)
  if (recipes.length === 0) {
    console.warn(`[suggest] 0 recipes available — cooldown may be excluding all recipes`)
  }

  const today = new Date()
  const season = getSeason(today.getMonth())

  const systemMessage = buildSystemMessage(prefs, prefer_this_week ?? [], avoid_this_week ?? [], season)
  const userMessage = buildFullWeekUserMessage(
    active_dates,
    recipes,
    recentHistory,
    free_text ?? '',
    specific_requests ?? '',
  )

  const validIds = new Set(recipes.map((r) => r.id))

  function logValidation(days: DaySuggestions[]) {
    for (const day of days) {
      for (const opt of day.options) {
        if (!validIds.has(opt.recipe_id)) {
          console.warn(`[suggest] validation_fail date=${day.date} recipe_id=${opt.recipe_id} title="${opt.recipe_title}" — not in fetched recipe list`)
        }
      }
    }
    const totalOptions = days.reduce((n, d) => n + d.options.length, 0)
    const validOptions = days.reduce((n, d) => n + d.options.filter((o) => validIds.has(o.recipe_id)).length, 0)
    if (validOptions === 0 && totalOptions > 0) {
      console.error(`[suggest] 0 valid options after validation — all ${totalOptions} LLM options had unknown recipe_ids`)
    }
  }

  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    console.log(`[suggest] raw_llm_response=${raw.slice(0, 500)}${raw.length > 500 ? '…' : ''}`)
    // Strip markdown code fences the model occasionally wraps around the JSON
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    const parsed = JSON.parse(stripped) as { days: DaySuggestions[] }
    logValidation(parsed.days ?? [])
    const validated = validateSuggestions(parsed.days ?? [], validIds)
    return NextResponse.json({ days: validated })
  } catch (err) {
    console.error('LLM suggest error:', err)
    return NextResponse.json({ error: 'Suggestion failed. Please try again.' }, { status: 500 })
  }
}
