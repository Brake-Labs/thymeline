import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { user, recipes, allowedUsers, llmUsage } from '@/lib/db/schema'
import { sql, gte, isNull } from 'drizzle-orm'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export const GET = withAdmin(async () => {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS)

  const [userCount, recipeCount, tokenSum, pendingInvites] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(user),
    db.select({ count: sql<number>`count(*)::int` }).from(recipes),
    db
      .select({
        total: sql<number>`coalesce(sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens}), 0)::int`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, sevenDaysAgo)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(allowedUsers)
      .where(isNull(allowedUsers.disabledAt)),
  ])

  return NextResponse.json({
    totalUsers: userCount[0]?.count ?? 0,
    totalRecipes: recipeCount[0]?.count ?? 0,
    tokensLast7d: tokenSum[0]?.total ?? 0,
    activeAllowedUsers: pendingInvites[0]?.count ?? 0,
  })
})
