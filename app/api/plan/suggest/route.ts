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
  callLLMStreaming,
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

  // Try streaming first
  const stream = await callLLMStreaming(systemMessage, userMessage)
  if (stream) {
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let buffer = ''
          for await (const chunk of stream) {
            buffer += typeof chunk === 'string' ? chunk : (chunk as { text?: string }).text ?? ''
            // Try to extract complete day objects from the buffer
            const dayRegex = /\{[^{}]*"date"\s*:\s*"[^"]+"\s*,[^{}]*"options"\s*:\s*\[[^\]]*\][^{}]*\}/g
            let match: RegExpExecArray | null
            while ((match = dayRegex.exec(buffer)) !== null) {
              try {
                const dayObj = JSON.parse(match[0]) as DaySuggestions
                const validated = validateSuggestions([dayObj], validIds)[0]
                controller.enqueue(encoder.encode(JSON.stringify(validated) + '\n'))
              } catch {
                // skip malformed chunk
              }
              buffer = buffer.slice(dayRegex.lastIndex)
              dayRegex.lastIndex = 0
            }
          }
          // Parse remaining buffer for any complete days
          try {
            const parsed = JSON.parse(buffer.trim()) as { days: DaySuggestions[] }
            if (parsed.days) {
              const validated = validateSuggestions(parsed.days, validIds)
              for (const day of validated) {
                controller.enqueue(encoder.encode(JSON.stringify(day) + '\n'))
              }
            }
          } catch {
            // buffer was already consumed
          }
        } catch (err) {
          console.error('Streaming error:', err)
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  // Non-streaming fallback
  try {
    const raw = await callLLMNonStreaming(systemMessage, userMessage)
    const parsed = JSON.parse(raw.trim()) as { days: DaySuggestions[] }
    const validated = validateSuggestions(parsed.days ?? [], validIds)
    return NextResponse.json({ days: validated })
  } catch (err) {
    console.error('LLM suggest error:', err)
    return NextResponse.json({ error: 'Suggestion failed. Please try again.' }, { status: 500 })
  }
}
