import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase-server'
import { resolveHouseholdScope, canManage } from '@/lib/household'
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

  const db = createAdminClient()
  const ctx = await resolveHouseholdScope(db, user.id)

  let query = db
    .from('user_preferences')
    .select('options_per_day, cooldown_days, seasonal_mode, preferred_tags, avoided_tags, limited_tags, onboarding_completed, is_active')

  if (ctx) {
    query = query.eq('household_id', ctx.householdId)
  } else {
    query = query.eq('user_id', user.id)
  }

  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(DEFAULT_PREFS)
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
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

  const db = createAdminClient()
  const ctx = await resolveHouseholdScope(db, user.id)

  // Household members without manage permission cannot update shared preferences
  if (ctx && !canManage(ctx.role)) {
    return NextResponse.json(
      { error: 'Only owner or co-owner can update household preferences.' },
      { status: 403 },
    )
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

  // Validate tag arrays — scope to household or user
  const tagArrayFields = ['preferred_tags', 'avoided_tags'] as const
  for (const field of tagArrayFields) {
    if (field in body) {
      const tags = body[field]
      if (!Array.isArray(tags)) {
        return NextResponse.json({ error: `${field} must be an array` }, { status: 400 })
      }
      if (tags.length > 0) {
        let tagsQuery = db.from('user_tags').select('name')
        if (ctx) {
          // Use household custom_tags for scoped validation
          tagsQuery = (db.from('custom_tags').select('name') as typeof tagsQuery)
          tagsQuery = tagsQuery.eq('household_id', ctx.householdId)
        } else {
          tagsQuery = tagsQuery.eq('user_id', user.id)
        }
        const { data: userTags } = await tagsQuery
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
    for (const item of lt as LimitedTag[]) {
      if (typeof item.cap !== 'number' || !Number.isInteger(item.cap) || item.cap < 1 || item.cap > 7) {
        return NextResponse.json({ error: `limited_tags cap must be an integer between 1 and 7` }, { status: 400 })
      }
    }
    if ((lt as LimitedTag[]).length > 0) {
      let tagsQuery = db.from('user_tags').select('name')
      if (ctx) {
        tagsQuery = (db.from('custom_tags').select('name') as typeof tagsQuery)
        tagsQuery = tagsQuery.eq('household_id', ctx.householdId)
      } else {
        tagsQuery = tagsQuery.eq('user_id', user.id)
      }
      const { data: userTags } = await tagsQuery
      const tagSet = new Set((userTags ?? []).map((t: { name: string }) => t.name))
      const unknown = (lt as LimitedTag[]).map((i) => i.tag).filter((t) => !tagSet.has(t))
      if (unknown.length > 0) {
        return NextResponse.json({ error: `Unknown tags in limited_tags: ${unknown.join(', ')}` }, { status: 400 })
      }
    }
  }

  const allowed = ['options_per_day', 'cooldown_days', 'seasonal_mode', 'preferred_tags', 'avoided_tags', 'limited_tags', 'onboarding_completed']

  if (ctx) {
    const update: Record<string, unknown> = { household_id: ctx.householdId }
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    const { data, error } = await db
      .from('user_preferences')
      .upsert(update, { onConflict: 'household_id' })
      .select('options_per_day, cooldown_days, seasonal_mode, preferred_tags, avoided_tags, limited_tags, onboarding_completed, is_active')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
    }
    return NextResponse.json(data)
  } else {
    const update: Record<string, unknown> = { user_id: user.id }
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    const { data, error } = await db
      .from('user_preferences')
      .upsert(update, { onConflict: 'user_id' })
      .select('options_per_day, cooldown_days, seasonal_mode, preferred_tags, avoided_tags, limited_tags, onboarding_completed, is_active')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
    }
    return NextResponse.json(data)
  }
}
