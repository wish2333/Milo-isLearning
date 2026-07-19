import 'server-only'

import type { NextRequest } from 'next/server'

import { countTopicExpandItems } from '@/lib/compiler/pipeline'
import { expandJobLibrary } from '@/lib/persistence/expand-job-library'
import { isStorageEnabled } from '@/lib/persistence/server/config'
import { getDb } from '@/lib/persistence/server/db-singleton'
import { ServerSQLiteRepository } from '@/lib/persistence/server/sqlite-repository'
import { APP_MODE } from '@/lib/runtime/app-mode'

export const runtime = 'nodejs'

function unavailable(): Response {
  return Response.json(
    { error: 'topic-expand is only available in production storage mode' },
    { status: 404 },
  )
}

function getRepository(): ServerSQLiteRepository | null {
  if (APP_MODE !== 'production' || !isStorageEnabled) return null
  return new ServerSQLiteRepository(getDb())
}

function parseJobId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function responseForJob(job: NonNullable<ReturnType<typeof expandJobLibrary.get>>): Response {
  const counts = countTopicExpandItems(job)
  return Response.json({
    job,
    completedItemCount: counts.completedItems,
    cancelledItemCount: counts.cancelledItems,
  })
}

/** GET /api/compile/expand-job?jobId=... — 刷新后的批量任务恢复。 */
export async function GET(req: NextRequest): Promise<Response> {
  const repository = getRepository()
  if (!repository) return unavailable()

  const jobId = parseJobId(req.nextUrl.searchParams.get('jobId'))
  if (!jobId) return Response.json({ error: 'Missing required field: jobId' }, { status: 400 })

  try {
    const job = expandJobLibrary.get(jobId, repository)
    if (!job) return Response.json({ error: 'expand_job_not_found' }, { status: 404 })
    return responseForJob(job)
  } catch {
    return Response.json({ error: 'expand_job_storage_unavailable' }, { status: 503 })
  }
}

/**
 * POST /api/compile/expand-job
 *
 * pause/resume 只改变 job 边界状态；retry 将失败 item 重新置为 queued。
 * 真正的 provider 调用仍由 /api/compile 的 SSE pipeline 完成。
 */
export async function POST(req: NextRequest): Promise<Response> {
  const repository = getRepository()
  if (!repository) return unavailable()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body === null || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = body as Record<string, unknown>
  const jobId = parseJobId(parsed.jobId)
  const action = parsed.action
  if (!jobId || (action !== 'pause' && action !== 'resume' && action !== 'retry')) {
    return Response.json({ error: 'jobId and action are required' }, { status: 400 })
  }

  try {
    const job = expandJobLibrary.get(jobId, repository)
    if (!job) return Response.json({ error: 'expand_job_not_found' }, { status: 404 })

    if (action === 'pause') {
      if (job.status === 'running') expandJobLibrary.update(jobId, { status: 'paused' }, repository)
    } else if (action === 'resume') {
      if (job.status === 'paused' || job.status === 'failed' || job.status === 'created') {
        expandJobLibrary.update(jobId, { status: 'running' }, repository)
      }
    } else {
      const itemId = parseJobId(parsed.itemId)
      if (!itemId) return Response.json({ error: 'itemId is required for retry' }, { status: 400 })
      const item = job.items.find((candidate) => candidate.itemId === itemId)
      if (!item) return Response.json({ error: 'expand_job_item_not_found' }, { status: 404 })
      if (item.status !== 'failed') {
        return Response.json({ error: 'expand_job_item_not_failed' }, { status: 409 })
      }
      if (item.error && !item.error.retryable) {
        return Response.json({ error: 'expand_job_item_not_retryable' }, { status: 409 })
      }
      expandJobLibrary.updateItem(jobId, itemId, { status: 'queued', error: null }, repository)
      if (job.status === 'failed' || job.status === 'paused') {
        expandJobLibrary.update(jobId, { status: 'running' }, repository)
      }
    }

    const finalJob = expandJobLibrary.get(jobId, repository)
    if (!finalJob) return Response.json({ error: 'expand_job_not_found' }, { status: 404 })
    return responseForJob(finalJob)
  } catch {
    return Response.json({ error: 'expand_job_storage_unavailable' }, { status: 503 })
  }
}
