// Note: in-memory only — jobs are lost on server restart or in multi-instance deployments.
// If deploying to Vercel (multi-instance/serverless), store jobs in Redis or a persistent store instead.
//
// globalThis is used to persist the Map across Next.js hot-module reloads in dev mode,
// which would otherwise re-initialise the module and lose all in-progress jobs.

import type { ParsedRecipe } from '@/types'

export type JobResultStatus = 'pending' | 'success' | 'partial' | 'failed'

export interface JobResult {
  url:        string
  status:     JobResultStatus
  recipe?:    ParsedRecipe
  error?:     string
  duplicate?: { recipeId: string; recipeTitle: string }
}

export interface ImportJob {
  userId:    string
  total:     number
  completed: number
  results:   JobResult[]
  createdAt: number
}

declare global {
  // eslint-disable-next-line no-var
  var __importJobs: Map<string, ImportJob> | undefined
}

function getJobStore(): Map<string, ImportJob> {
  if (!globalThis.__importJobs) {
    globalThis.__importJobs = new Map()
  }
  return globalThis.__importJobs
}

const JOB_TTL_MS = 30 * 60 * 1000 // 30 minutes

export function createJob(id: string, userId: string, urls: string[]): void {
  getJobStore().set(id, {
    userId,
    total:     urls.length,
    completed: 0,
    results:   urls.map((url) => ({ url, status: 'pending' })),
    createdAt: Date.now(),
  })
}

export function getJob(id: string): ImportJob | undefined {
  return getJobStore().get(id)
}

export function updateJob(id: string, result: JobResult): void {
  const job = getJobStore().get(id)
  if (!job) return
  const idx = job.results.findIndex((r) => r.url === result.url)
  if (idx >= 0) {
    job.results[idx] = result
    job.completed++
  }
}

export function evictExpired(): void {
  const store = getJobStore()
  const now = Date.now()
  for (const [id, job] of store.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      store.delete(id)
    }
  }
}
