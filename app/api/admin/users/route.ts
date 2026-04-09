import { NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { user, recipes, allowedUsers, llmUsage } from '@/lib/db/schema'
import { sql, gte } from 'drizzle-orm'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export const GET = withAdmin(async () => {
  const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS)

  const [users, recipeCounts, tokenUsage, allowedList] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt,
      })
      .from(user),

    db
      .select({
        userId: recipes.userId,
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(recipes)
      .groupBy(recipes.userId),

    db
      .select({
        userId: llmUsage.userId,
        totalTokens: sql<number>`sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens})::int`.as('total_tokens'),
      })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, sevenDaysAgo))
      .groupBy(llmUsage.userId),

    db
      .select({
        email: allowedUsers.email,
        disabledAt: allowedUsers.disabledAt,
      })
      .from(allowedUsers),
  ])

  const recipeMap = new Map(recipeCounts.map((r) => [r.userId, r.count]))
  const tokenMap = new Map(tokenUsage.map((t) => [t.userId, t.totalTokens]))
  const allowedMap = new Map(allowedList.map((a) => [a.email.toLowerCase(), a.disabledAt]))

  const result = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    createdAt: u.createdAt,
    recipeCount: recipeMap.get(u.id) ?? 0,
    tokensLast7d: tokenMap.get(u.id) ?? 0,
    status: allowedMap.has(u.email.toLowerCase())
      ? (allowedMap.get(u.email.toLowerCase()) ? 'disabled' : 'active')
      : 'active',
  }))

  return NextResponse.json({ users: result })
})
