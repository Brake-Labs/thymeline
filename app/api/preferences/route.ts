import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { canManage, scopeCondition, scopeInsert } from '@/lib/household'
import { LimitedTag } from '@/types'
import { updatePreferencesSchema, parseBody } from '@/lib/schemas'
import { FIRST_CLASS_TAGS } from '@/lib/tags'
import { db } from '@/lib/db'
import { userPreferences, customTags } from '@/lib/db/schema'
import { dbFirst } from '@/lib/db/helpers'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

function dayNameToNumber(name: string): number {
  const idx = DAY_NAMES.indexOf(name as typeof DAY_NAMES[number])
  return idx >= 0 ? idx : 0
}

function numberToDayName(n: number): string {
  return DAY_NAMES[n] ?? 'sunday'
}

const DEFAULT_PREFS = {
  optionsPerDay: 3,
  cooldownDays: 28,
  seasonalMode: true,
  preferredTags: [] as string[],
  avoidedTags: [] as string[],
  limitedTags: [] as LimitedTag[],
  onboardingCompleted: false,
  isActive: true,
  mealContext: null as string | null,
  hiddenTags: [] as string[],
  weekStartDay: 0,
}

export const GET = withAuth(async (req, { user, ctx }) => {
  try {
    const rows = await db
      .select({
        optionsPerDay: userPreferences.optionsPerDay,
        cooldownDays: userPreferences.cooldownDays,
        seasonalMode: userPreferences.seasonalMode,
        preferredTags: userPreferences.preferredTags,
        avoidedTags: userPreferences.avoidedTags,
        limitedTags: userPreferences.limitedTags,
        onboardingCompleted: userPreferences.onboardingCompleted,
        isActive: userPreferences.isActive,
        mealContext: userPreferences.mealContext,
        hiddenTags: userPreferences.hiddenTags,
        weekStartDay: userPreferences.weekStartDay,
      })
      .from(userPreferences)
      .where(scopeCondition({ userId: userPreferences.userId, householdId: userPreferences.householdId }, user.id, ctx))

    const data = dbFirst(rows)

    if (!data) {
      return NextResponse.json(DEFAULT_PREFS)
    }

    return NextResponse.json({ ...data, weekStartDay: dayNameToNumber(data.weekStartDay) })
  } catch (err) {
    console.error('[GET /api/preferences] DB error:', err)
    return NextResponse.json(DEFAULT_PREFS)
  }
})

export const PATCH = withAuth(async (req, { user, ctx }) => {
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
  for (const field of ['preferredTags', 'avoidedTags'] as const) {
    if (field in body) allTagsToValidate.push(...(body[field] as string[]))
  }
  if ('limitedTags' in body) {
    allTagsToValidate.push(...(body.limitedTags as LimitedTag[]).map((i) => i.tag))
  }
  const needsLookup = allTagsToValidate.filter((t) => !FIRST_CLASS_TAGS.includes(t))
  if (needsLookup.length > 0) {
    const tagRows = await db
      .select({ name: customTags.name })
      .from(customTags)
      .where(scopeCondition({ userId: customTags.userId, householdId: customTags.householdId }, user.id, ctx))

    const customTagNames = new Set(tagRows.map((t) => t.name))
    const unknown = needsLookup.filter((t) => !customTagNames.has(t))
    if (unknown.length > 0) {
      const validationError = `Unknown tags: ${unknown.join(', ')}`
      console.warn('[PATCH /api/preferences] validation error:', validationError)
      return NextResponse.json({ error: validationError }, { status: 400 })
    }
  }

  // Build the payload with only allowed fields
  const allowed = ['optionsPerDay', 'cooldownDays', 'seasonalMode', 'preferredTags', 'avoidedTags', 'limitedTags', 'onboardingCompleted', 'mealContext', 'hiddenTags', 'weekStartDay'] as const
  const bodyRecord = body as Record<string, unknown>

  // Map snake_case body keys to camelCase Drizzle columns
  const keyMap: Record<string, string> = {
    optionsPerDay: 'optionsPerDay',
    cooldownDays: 'cooldownDays',
    seasonalMode: 'seasonalMode',
    preferredTags: 'preferredTags',
    avoidedTags: 'avoidedTags',
    limitedTags: 'limitedTags',
    onboardingCompleted: 'onboardingCompleted',
    mealContext: 'mealContext',
    hiddenTags: 'hiddenTags',
    weekStartDay: 'weekStartDay',
  }

  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) {
      if (key === 'weekStartDay') {
        update[keyMap[key]!] = numberToDayName(bodyRecord[key] as number)
      } else {
        update[keyMap[key]!] = bodyRecord[key]
      }
    }
  }

  const scope = scopeInsert(user.id, ctx)
  const payload = { ...update, ...scope }

  try {
    const rows = await db
      .insert(userPreferences)
      .values(payload as typeof userPreferences.$inferInsert)
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: payload,
      })
      .returning({
        optionsPerDay: userPreferences.optionsPerDay,
        cooldownDays: userPreferences.cooldownDays,
        seasonalMode: userPreferences.seasonalMode,
        preferredTags: userPreferences.preferredTags,
        avoidedTags: userPreferences.avoidedTags,
        limitedTags: userPreferences.limitedTags,
        onboardingCompleted: userPreferences.onboardingCompleted,
        isActive: userPreferences.isActive,
        mealContext: userPreferences.mealContext,
        hiddenTags: userPreferences.hiddenTags,
        weekStartDay: userPreferences.weekStartDay,
      })

    const data = dbFirst(rows)
    if (!data) {
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
    }

    return NextResponse.json({ ...data, weekStartDay: dayNameToNumber(data.weekStartDay) })
  } catch (err) {
    console.warn('[PATCH /api/preferences] upsert error:', err)
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 })
  }
})
