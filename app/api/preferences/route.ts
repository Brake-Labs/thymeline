import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { canManage } from '@/lib/household'
import { LimitedTag } from '@/types'
import { updatePreferencesSchema, parseBody } from '@/lib/schemas'

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

export const GET = withAuth(async (req, { user, db, ctx }) => {
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
})

export const PATCH = withAuth(async (req, { user, db, ctx }) => {
  // Household members without manage permission cannot update shared preferences
  if (ctx && !canManage(ctx.role)) {
    return NextResponse.json(
      { error: 'Only owner or co-owner can update household preferences.' },
      { status: 403 },
    )
  }

  const { data: body, error: parseError } = await parseBody(req, updatePreferencesSchema)
  if (parseError) return parseError

  // Validate tag arrays against user's tag library — scope to household or user
  const tagArrayFields = ['preferred_tags', 'avoided_tags'] as const
  for (const field of tagArrayFields) {
    if (field in body) {
      const tags = body[field] as string[]
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
        const unknown = tags.filter((t) => !tagSet.has(t))
        if (unknown.length > 0) {
          return NextResponse.json({ error: `Unknown tags: ${unknown.join(', ')}` }, { status: 400 })
        }
      }
    }
  }

  // Validate limited_tags against user's tag library
  if ('limited_tags' in body) {
    const lt = body.limited_tags as LimitedTag[]
    if (lt.length > 0) {
      let tagsQuery = db.from('user_tags').select('name')
      if (ctx) {
        tagsQuery = (db.from('custom_tags').select('name') as typeof tagsQuery)
        tagsQuery = tagsQuery.eq('household_id', ctx.householdId)
      } else {
        tagsQuery = tagsQuery.eq('user_id', user.id)
      }
      const { data: userTags } = await tagsQuery
      const tagSet = new Set((userTags ?? []).map((t: { name: string }) => t.name))
      const unknown = lt.map((i) => i.tag).filter((t) => !tagSet.has(t))
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
})
