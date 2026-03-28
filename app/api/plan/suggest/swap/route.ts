import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { resolveHouseholdScope } from '@/lib/household'
import {
  getSeason,
  fetchCooldownFilteredRecipes,
  fetchRecentHistory,
  fetchUserPreferences,
  buildSystemMessage,
  buildSwapUserMessage,
  validateSuggestions,
  callLLMNonStreaming,
  MEAL_TYPE_CATEGORIES,
} from '../../helpers'
import type { DaySuggestions, MealType } from '@/types'

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    date: string
    meal_type?: MealType
    week_start: string
    already_selected: { date: string; recipe_id: string }[]
    prefer_this_week: string[]
    avoid_this_week: string[]
    free_text: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { date, already_selected, prefer_this_week, avoid_this_week, free_text } = body
  const meal_type: MealType = body.meal_type ?? 'dinner'

  const db = createAdminClient()
  const ctx = await resolveHouseholdScope(db, user.id)

  const prefs = await fetchUserPreferences(supabase, user.id, ctx)
  const cooldownDays = prefs?.cooldown_days ?? 28
  const categories = MEAL_TYPE_CATEGORIES[meal_type]
  const recipes = await fetchCooldownFilteredRecipes(supabase, user.id, cooldownDays, categories, ctx)
  const recentHistory = await fetchRecentHistory(supabase, user.id)

  const today = new Date()
  const season = getSeason(today.getMonth())

  const systemMessage = buildSystemMessage(prefs, prefer_this_week ?? [], avoid_this_week ?? [], season)
  const userMessage = buildSwapUserMessage(
    date,
    meal_type,
    recipes,
    recentHistory,
    already_selected ?? [],
    free_text ?? '',
    recipes,
  )

  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
    const parsed = JSON.parse(stripped) as { days: DaySuggestions[] }
    const days = parsed.days ?? []
    const validIds = new Map<MealType, Set<string>>([[meal_type, new Set(recipes.map((r) => r.id))]])
    const validated = validateSuggestions(days, validIds)
    const dayResult = validated.find((d) => d.date === date)
    const options = dayResult?.meal_types?.find((m) => m.meal_type === meal_type)?.options ?? []
    return NextResponse.json({ date, meal_type, options })
  } catch (err) {
    console.error('LLM swap error:', err)
    return NextResponse.json({ error: 'Swap failed. Please try again.' }, { status: 500 })
  }
}
