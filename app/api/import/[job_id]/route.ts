import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { getJob, evictExpired } from '@/lib/import-jobs'

export const GET = withAuth(async (_req, { user }, params) => {
  const jobId = params['job_id']

  evictExpired()

  const job = jobId ? getJob(jobId) : undefined
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
