import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { parseBody, importUrlsSchema } from '@/lib/schemas'
import { detectDuplicates } from '@/lib/import/detect-duplicates'
import { scrapeRecipe } from '@/lib/scrape-recipe'
import { createJob, updateJob, evictExpired } from '@/lib/import-jobs'
import type { HouseholdContext, ParsedRecipe } from '@/types'
import type { JobResultStatus } from '@/lib/import-jobs'

export type { JobResultStatus, JobResult, ImportJob } from '@/lib/import-jobs'

// ── Concurrency semaphore ──────────────────────────────────────────────────

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

// ── Background scraper ─────────────────────────────────────────────────────

const MAX_RETRIES = 3

async function scrapeUrl(
  url: string,
  jobId: string,
  userId: string,
  ctx: HouseholdContext | null,
): Promise<void> {
  await acquire()
  try {
    let lastError = 'Scrape failed'

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const data = await scrapeRecipe(url, userId, null, ctx)

      if (!('error' in data)) {
        const recipe: ParsedRecipe = {
          title:                 data.title ?? '(untitled)',
          category:              data.category ?? null,
          ingredients:           data.ingredients ?? null,
          steps:                 data.steps ?? null,
          notes:                 null,
          url:                   data.sourceUrl ?? url,
          imageUrl:             data.imageUrl ?? null,
          prepTimeMinutes:     data.prepTimeMinutes ?? null,
          cookTimeMinutes:     data.cookTimeMinutes ?? null,
          totalTimeMinutes:    data.totalTimeMinutes ?? null,
          inactiveTimeMinutes: data.inactiveTimeMinutes ?? null,
          servings:              data.servings ?? null,
          tags:                  data.suggestedTags ?? [],
          source:                'scraped',
          stepPhotos:            [],
          history:               [],
        }

        const status: JobResultStatus = data.partial
          ? (recipe.title ? 'partial' : 'failed')
          : 'success'

        const [dup] = await detectDuplicates([recipe], null, userId, ctx)

        updateJob(jobId, {
          url,
          status,
          recipe:    status !== 'failed' ? recipe : undefined,
          error:     status === 'failed' ? 'Failed to extract recipe data' : undefined,
          duplicate: dup ?? undefined,
        })
        return
      }

      if (data.code === 'rate_limit' && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, data.retryAfterMs ?? 10_000))
        continue
      }

      lastError = data.error
      break
    }

    updateJob(jobId, { url, status: 'failed', error: lastError })
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

// ── POST /api/import/urls ──────────────────────────────────────────────────

export const POST = withAuth(async (req: NextRequest, { user, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, importUrlsSchema)
  if (parseError) return parseError

  evictExpired()

  const jobId = crypto.randomUUID()
  createJob(jobId, user.id, body.urls)

  // Fire and forget — do NOT await
  void Promise.all(
    body.urls.map((url) => scrapeUrl(url, jobId, user.id, ctx)),
  )

  return NextResponse.json({ job_id: jobId, total: body.urls.length }, { status: 202 })
})
