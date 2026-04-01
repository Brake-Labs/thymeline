import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { parseBody, importUrlsSchema } from '@/lib/schemas'
import { detectDuplicates } from '@/lib/import/detect-duplicates'
import { scrapeRecipe } from '@/lib/scrape-recipe'
import type { HouseholdContext, ParsedRecipe } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── In-memory job storage ──────────────────────────────────────────────────
//
// NOTE: Module-level state does NOT persist across serverless function
// invocations on Vercel. This is accepted for v1. In local dev (Node.js
// server mode), jobs persist correctly for the lifetime of the server process.

export type JobResultStatus = 'pending' | 'success' | 'partial' | 'failed'

export interface JobResult {
  url:        string
  status:     JobResultStatus
  recipe?:    ParsedRecipe
  error?:     string
  duplicate?: { recipe_id: string; recipe_title: string }
}

export interface ImportJob {
  userId:    string
  total:     number
  completed: number
  results:   JobResult[]
  createdAt: number
}

export const importJobs = new Map<string, ImportJob>()

const JOB_TTL_MS = 30 * 60 * 1000 // 30 minutes

/** Evict jobs older than JOB_TTL_MS */
function evictExpiredJobs() {
  const now = Date.now()
  for (const [id, job] of importJobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      importJobs.delete(id)
    }
  }
}

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
  const job = importJobs.get(jobId)
  if (!job) return

  const resultIdx = job.results.findIndex((r) => r.url === url)

  await acquire()
  try {
    const data = await scrapeRecipe(url, userId, db, ctx)

    if ('error' in data) {
      const job2 = importJobs.get(jobId)
      if (job2 && resultIdx >= 0) {
        job2.results[resultIdx] = { url, status: 'failed', error: data.error }
        job2.completed++
      }
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

    // Duplicate detection for this single result
    const [dup] = await detectDuplicates([recipe], db, userId, ctx)

    const job2 = importJobs.get(jobId)
    if (job2 && resultIdx >= 0) {
      job2.results[resultIdx] = {
        url,
        status,
        recipe: status !== 'failed' ? recipe : undefined,
        error: status === 'failed' ? 'Failed to extract recipe data' : undefined,
        duplicate: dup ?? undefined,
      }
      job2.completed++
    }
  } catch (err) {
    const job2 = importJobs.get(jobId)
    if (job2 && resultIdx >= 0) {
      job2.results[resultIdx] = {
        url,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Scrape failed',
      }
      job2.completed++
    }
  } finally {
    release()
  }
}

// ─── POST /api/import/urls ──────────────────────────────────────────────────

export const POST = withAuth(async (req: NextRequest, { user, db, ctx }) => {
  const { data: body, error: parseError } = await parseBody(req, importUrlsSchema)
  if (parseError) return parseError

  evictExpiredJobs()

  const jobId = crypto.randomUUID()
  const job: ImportJob = {
    userId:    user.id,
    total:     body.urls.length,
    completed: 0,
    results:   body.urls.map((url) => ({ url, status: 'pending' as const })),
    createdAt: Date.now(),
  }
  importJobs.set(jobId, job)

  // Fire and forget — do NOT await
  void Promise.all(
    body.urls.map((url) => scrapeUrl(url, jobId, db, user.id, ctx)),
  )

  return NextResponse.json({ job_id: jobId, total: body.urls.length }, { status: 202 })
})
