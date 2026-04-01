import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { parseBody, importUrlsSchema } from '@/lib/schemas'
import { detectDuplicates } from '@/lib/import/detect-duplicates'
import { scrapeRecipe } from '@/lib/scrape-recipe'
import { createJob, updateJob, evictExpired } from '@/lib/import-jobs'
import type { HouseholdContext, ParsedRecipe } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobResultStatus } from '@/lib/import-jobs'

export type { JobResultStatus, JobResult, ImportJob } from '@/lib/import-jobs'

// ─── Concurrency semaphore ──────────────────────────────────────────────────

let running = 0
const CONCURRENCY = 3

async function acquire() {
  while (running >= CONCURRENCY) {
    await new Promise((r) => setTimeout(r, 200))
  }
  running++
}

function release() {
  running--
}

// ─── Background scraper ─────────────────────────────────────────────────────

async function scrapeUrl(
  url: string,
  jobId: string,
  db: SupabaseClient,
  userId: string,
  ctx: HouseholdContext | null,
): Promise<void> {
  await acquire()
  try {
    const data = await scrapeRecipe(url, userId, db, ctx)

    if ('error' in data) {
      updateJob(jobId, { url, status: 'failed', error: data.error })
      return
    }

    const recipe: ParsedRecipe = {
      title:                 data.title ?? '(untitled)',
      category:              null,
      ingredients:           data.ingredients ?? null,
      steps:                 data.steps ?? null,
      notes:                 null,
      url:                   data.sourceUrl ?? url,
      image_url:             data.imageUrl ?? null,
      prep_time_minutes:     data.prepTimeMinutes ?? null,
      cook_time_minutes:     data.cookTimeMinutes ?? null,
      total_time_minutes:    data.totalTimeMinutes ?? null,
      inactive_time_minutes: data.inactiveTimeMinutes ?? null,
      servings:              data.servings ?? null,
      tags:                  data.suggestedTags ?? [],
      source:                'scraped',
    }

    const status: JobResultStatus = data.partial
      ? (recipe.title ? 'partial' : 'failed')
      : 'success'

    const [dup] = await detectDuplicates([recipe], db, userId, ctx)

    updateJob(jobId, {
      url,
      status,
      recipe:    status !== 'failed' ? recipe : undefined,
      error:     status === 'failed' ? 'Failed to extract recipe data' : undefined,
      duplicate: dup ?? undefined,
    })
  } catch (err) {
    updateJob(jobId, {
      url,
      status: 'failed',
      error:  err instanceof Error ? err.message : 'Scrape failed',
    })
  } finally {
    release()
  }
}

// ─── POST /api/import/urls ──────────────────────────────────────────────────

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, importUrlsSchema)
  if (parseError) return parseError

  evictExpired()

  const jobId = crypto.randomUUID()
  createJob(jobId, user.id, body.urls.length)

  // Fire and forget — do NOT await
  void Promise.all(
    body.urls.map((url) => scrapeUrl(url, jobId, db, user.id, ctx)),
  )

  return NextResponse.json({ job_id: jobId, total: body.urls.length }, { status: 202 })
})
