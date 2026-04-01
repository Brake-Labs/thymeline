// Note: in-memory only — jobs are lost on server restart or in multi-instance deployments.
// If deploying to Vercel (multi-instance/serverless), store jobs in Redis or Supabase instead.

import type { ParsedRecipe } from '@/types'

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

const JOB_TTL_MS = 30 * 60 * 1000 // 30 minutes

const jobs = new Map<string, ImportJob>()

export function createJob(id: string, userId: string, urls: string[]): void {
  jobs.set(id, {
    userId,
    total:     urls.length,
    completed: 0,
    results:   urls.map((url) => ({ url, status: 'pending' })),
    createdAt: Date.now(),
  })
}

export function getJob(id: string): ImportJob | undefined {
  return jobs.get(id)
}

export function updateJob(id: string, result: JobResult): void {
  const job = jobs.get(id)
  if (!job) return
  const idx = job.results.findIndex((r) => r.url === result.url)
  if (idx >= 0) {
    job.results[idx] = result
    job.completed++
  }
}

export function evictExpired(): void {
  const now = Date.now()
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id)
    }
  }
}
