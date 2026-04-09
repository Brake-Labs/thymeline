import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { llmUsage, user } from '@/lib/db/schema'
import { sql, gte, eq, and } from 'drizzle-orm'

export const GET = withAdmin(async (req: NextRequest) => {
  const url = new URL(req.url)
  const range = url.searchParams.get('range') ?? '7d'
  const userId = url.searchParams.get('userId')

  let since: Date
  if (range === '30d') {
    since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  } else if (range === 'all') {
    since = new Date(0)
  } else {
    since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  }

  const conditions = [gte(llmUsage.createdAt, since)]
  if (userId) {
    conditions.push(eq(llmUsage.userId, userId))
  }

  // Per-feature breakdown
  const byFeature = await db
    .select({
      feature: llmUsage.feature,
      model: llmUsage.model,
      totalInput: sql<number>`sum(${llmUsage.inputTokens})::int`.as('total_input'),
      totalOutput: sql<number>`sum(${llmUsage.outputTokens})::int`.as('total_output'),
      callCount: sql<number>`count(*)::int`.as('call_count'),
    })
    .from(llmUsage)
    .where(and(...conditions))
    .groupBy(llmUsage.feature, llmUsage.model)

  // Per-user breakdown
  const byUser = await db
    .select({
      userId: llmUsage.userId,
      userName: user.name,
      userEmail: user.email,
      feature: llmUsage.feature,
      totalTokens: sql<number>`sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens})::int`.as('total_tokens'),
    })
    .from(llmUsage)
    .leftJoin(user, eq(llmUsage.userId, user.id))
    .where(and(...conditions))
    .groupBy(llmUsage.userId, user.name, user.email, llmUsage.feature)

  return NextResponse.json({ byFeature, byUser, range })
})
