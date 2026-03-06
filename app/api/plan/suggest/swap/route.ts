import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import {
  getSeason,
  fetchCooldownFilteredRecipes,
  fetchRecentHistory,
  fetchUserPreferences,
  buildSystemMessage,
  buildSwapUserMessage,
  validateSuggestions,
  callLLMNonStreaming,
} from '../../helpers'
import type { DaySuggestions } from '@/types'

export async function POST(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    date: string
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

  const prefs = await fetchUserPreferences(supabase, user.id)
  const cooldownDays = prefs?.cooldown_days ?? 28
  const recipes = await fetchCooldownFilteredRecipes(supabase, user.id, cooldownDays)
  const recentHistory = await fetchRecentHistory(supabase, user.id)

  const today = new Date()
  const season = getSeason(today.getMonth())

  const systemMessage = buildSystemMessage(prefs, prefer_this_week ?? [], avoid_this_week ?? [], season)
  const userMessage = buildSwapUserMessage(
    date,
    recipes,
    recentHistory,
    already_selected ?? [],
    free_text ?? '',
    recipes,
  )

  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    const parsed = JSON.parse(raw.trim()) as { days: DaySuggestions[] }
    const days = parsed.days ?? []
    const validIds = new Set(recipes.map((r) => r.id))
    const validated = validateSuggestions(days, validIds)
    const dayResult = validated.find((d) => d.date === date) ?? { date, options: [] }
    return NextResponse.json({ date: dayResult.date, options: dayResult.options })
  } catch (err) {
    console.error('LLM swap error:', err)
    return NextResponse.json({ error: 'Swap failed. Please try again.' }, { status: 500 })
  }
}
