// ─── In-memory job storage ──────────────────────────────────────────────────
//
// NOTE: Module-level state does NOT persist across serverless function
// invocations on Vercel. This is accepted for v1. In local dev (Node.js
// server mode), jobs persist correctly for the lifetime of the server process.

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

export const importJobs = new Map<string, ImportJob>()
