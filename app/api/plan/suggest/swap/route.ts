import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { swapSchema, parseBody } from '@/lib/schemas'
import { parseLLMJsonSafe } from '@/lib/llm'
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

export const POST = withAuth(async (req: NextRequest, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, swapSchema)
  if (parseError) return parseError

  const { date, alreadySelected, preferThisWeek, avoidThisWeek, freeText } = body
  const mealType: MealType = body.mealType ?? 'dinner'

  const prefs = await fetchUserPreferences(user.id, ctx)
  const cooldownDays = prefs?.cooldownDays ?? 28
  const categories = MEAL_TYPE_CATEGORIES[mealType]
  const recs = await fetchCooldownFilteredRecipes(user.id, cooldownDays, categories, ctx)
  const recentHistory = await fetchRecentHistory(user.id)

  const today = new Date()
  const season = getSeason(today.getMonth())

  const systemMessage = buildSystemMessage(prefs, preferThisWeek ?? [], avoidThisWeek ?? [], season)
  const userMessage = buildSwapUserMessage(
    date,
    mealType,
    recs,
    recentHistory,
    alreadySelected ?? [],
    freeText ?? '',
    recs,
  )

  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    const parsed = parseLLMJsonSafe<{ days: DaySuggestions[] }>(raw)
    if (!parsed || !Array.isArray(parsed.days)) {
      console.error('[swap] Invalid LLM response structure')
      return NextResponse.json({ error: 'Swap failed. Please try again.' }, { status: 500 })
    }
    const days = parsed.days
    const validIds = new Map<MealType, Set<string>>([[mealType, new Set(recs.map((r) => r.id))]])
    const validated = validateSuggestions(days, validIds)
    const dayResult = validated.find((d) => d.date === date)
    const options = dayResult?.mealTypes?.find((m) => m.mealType === mealType)?.options ?? []
    return NextResponse.json({ date, mealType, options })
  } catch (err) {
    console.error('LLM swap error:', err)
    return NextResponse.json({ error: 'Swap failed. Please try again.' }, { status: 500 })
  }
})
