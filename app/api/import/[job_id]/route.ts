import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { importJobs } from '../urls/route'

const JOB_TTL_MS = 30 * 60 * 1000 // 30 minutes

function evictExpiredJobs() {
  const now = Date.now()
  for (const [id, job] of importJobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) {
      importJobs.delete(id)
    }
  }
}

export const GET = withAuth(async (_req, { user }, params) => {
  const jobId = params['job_id']

  evictExpiredJobs()

  const job = jobId ? importJobs.get(jobId) : undefined
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.userId !== user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    job_id:    jobId,
    total:     job.total,
    completed: job.completed,
    results:   job.results,
  })
})
