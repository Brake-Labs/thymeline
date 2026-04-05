import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { canManage, scopeQuery } from '@/lib/household'
import { LimitedTag } from '@/types'
import { updatePreferencesSchema, parseBody } from '@/lib/schemas'
import { FIRST_CLASS_TAGS } from '@/lib/tags'

const DEFAULT_PREFS = {
  options_per_day: 3,
  cooldown_days: 28,
  seasonal_mode: true,
  preferred_tags: [] as string[],
  avoided_tags: [] as string[],
  limited_tags: [] as LimitedTag[],
  onboarding_completed: false,
  is_active: true,
  meal_context: null as string | null,
  hidden_tags: [] as string[],
  week_start_day: 0,
}

export const GET = withAuth(async (req, { user, db, ctx }) => {
  const query = scopeQuery(db
    .from('user_preferences')
    .select('options_per_day, cooldown_days, seasonal_mode, preferred_tags, avoided_tags, limited_tags, onboarding_completed, is_active, meal_context, hidden_tags, week_start_day'), user.id, ctx)

  const { data, error } = await query.maybeSingle()

  if (error) {
    // Log the error for observability but return defaults so the page renders.
    // A missing column during a pending migration is the most common cause here.
    console.error('[GET /api/preferences] DB error:', error.message, '(code:', error.code, ')')
    return NextResponse.json(DEFAULT_PREFS)
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

  // Validate all tag references against user's tag library (single DB lookup).
  // First-class tags are always valid; only unknown (potentially custom) tags need a check.
  const allTagsToValidate: string[] = []
  for (const field of ['preferred_tags', 'avoided_tags'] as const) {
    if (field in body) allTagsToValidate.push(...(body[field] as string[]))
  }
  if ('limited_tags' in body) {
    allTagsToValidate.push(...(body.limited_tags as LimitedTag[]).map((i) => i.tag))
  }
  const needsLookup = allTagsToValidate.filter((t) => !FIRST_CLASS_TAGS.includes(t))
  if (needsLookup.length > 0) {
    const tagsQuery = scopeQuery(db.from('custom_tags').select('name'), user.id, ctx)
    const { data: userTags } = await tagsQuery
    const customTagNames = new Set((userTags ?? []).map((t) => t.name))
    const unknown = needsLookup.filter((t) => !customTagNames.has(t))
    if (unknown.length > 0) {
      const validationError = `Unknown tags: ${unknown.join(', ')}`
      console.warn('[PATCH /api/preferences] validation error:', validationError)
      return NextResponse.json({ error: validationError }, { status: 400 })
    }
  }

  const allowed = ['options_per_day', 'cooldown_days', 'seasonal_mode', 'preferred_tags', 'avoided_tags', 'limited_tags', 'onboarding_completed', 'meal_context', 'hidden_tags', 'week_start_day'] as const
  const bodyRecord = body as Record<string, unknown>

  const update: Record<string, unknown> = { user_id: user.id }
  if (ctx) update.household_id = ctx.householdId
  for (const key of allowed) {
    if (key in body) update[key] = bodyRecord[key]
  }

  const onConflict = ctx ? 'household_id' : 'user_id'
  const { data, error } = await db
    .from('user_preferences')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic field selection from validated body
    .upsert(update as any, { onConflict })
    .select('options_per_day, cooldown_days, seasonal_mode, preferred_tags, avoided_tags, limited_tags, onboarding_completed, is_active, meal_context, hidden_tags, week_start_day')
    .single()

  if (error || !data) {
    console.warn('[PATCH /api/preferences] upsert error:', error?.message, error?.code)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
  return NextResponse.json(data)
})
