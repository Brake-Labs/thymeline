import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { LimitedTag } from '@/types'

const DEFAULT_PREFS = {
  options_per_day: 3,
  cooldown_days: 28,
  seasonal_mode: true,
  preferred_tags: [] as string[],
  avoided_tags: [] as string[],
  limited_tags: [] as LimitedTag[],
  onboarding_completed: false,
  is_active: true,
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('user_preferences')
    .select('options_per_day, cooldown_days, seasonal_mode, preferred_tags, avoided_tags, limited_tags, onboarding_completed, is_active')
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json(DEFAULT_PREFS)
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient(req)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate options_per_day
  if ('options_per_day' in body) {
    const v = body.options_per_day
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) {
      return NextResponse.json({ error: 'options_per_day must be an integer between 1 and 5' }, { status: 400 })
    }
  }

  // Validate cooldown_days
  if ('cooldown_days' in body) {
    const v = body.cooldown_days
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 60) {
      return NextResponse.json({ error: 'cooldown_days must be an integer between 1 and 60' }, { status: 400 })
    }
  }

  // Validate tag arrays against user_tags
  const tagArrayFields = ['preferred_tags', 'avoided_tags'] as const
  for (const field of tagArrayFields) {
    if (field in body) {
      const tags = body[field]
      if (!Array.isArray(tags)) {
        return NextResponse.json({ error: `${field} must be an array` }, { status: 400 })
      }
      if (tags.length > 0) {
        const { data: userTags } = await supabase
          .from('user_tags')
          .select('name')
          .eq('user_id', user.id)
        const tagSet = new Set((userTags ?? []).map((t: { name: string }) => t.name))
        const unknown = (tags as string[]).filter((t) => !tagSet.has(t))
        if (unknown.length > 0) {
          return NextResponse.json({ error: `Unknown tags: ${unknown.join(', ')}` }, { status: 400 })
        }
      }
    }
  }

  // Validate limited_tags
  if ('limited_tags' in body) {
    const lt = body.limited_tags
    if (!Array.isArray(lt)) {
      return NextResponse.json({ error: 'limited_tags must be an array' }, { status: 400 })
    }
    // Validate caps
    for (const item of lt as LimitedTag[]) {
      if (typeof item.cap !== 'number' || !Number.isInteger(item.cap) || item.cap < 1 || item.cap > 7) {
        return NextResponse.json({ error: `limited_tags cap must be an integer between 1 and 7` }, { status: 400 })
      }
    }
    // Validate tags exist
    if ((lt as LimitedTag[]).length > 0) {
      const { data: userTags } = await supabase
        .from('user_tags')
        .select('name')
        .eq('user_id', user.id)
      const tagSet = new Set((userTags ?? []).map((t: { name: string }) => t.name))
      const unknown = (lt as LimitedTag[]).map((i) => i.tag).filter((t) => !tagSet.has(t))
      if (unknown.length > 0) {
        return NextResponse.json({ error: `Unknown tags in limited_tags: ${unknown.join(', ')}` }, { status: 400 })
      }
    }
  }

  // Build update payload — only include allowed fields; is_active is write-protected
  const allowed = ['options_per_day', 'cooldown_days', 'seasonal_mode', 'preferred_tags', 'avoided_tags', 'limited_tags', 'onboarding_completed']
  const update: Record<string, unknown> = { user_id: user.id }
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }

  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(update, { onConflict: 'user_id' })
    .select('options_per_day, cooldown_days, seasonal_mode, preferred_tags, avoided_tags, limited_tags, onboarding_completed, is_active')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }

  return NextResponse.json(data)
}
