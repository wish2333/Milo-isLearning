import 'server-only'

import type { NextRequest } from 'next/server'
import { countTopicExpandItems, planTopicExpandCancellation } from '@/lib/compiler/pipeline'
import { expandJobLibrary } from '@/lib/persistence/expand-job-library'
import { isStorageEnabled } from '@/lib/persistence/server/config'
import { getDb } from '@/lib/persistence/server/db-singleton'
import { ServerSQLiteRepository } from '@/lib/persistence/server/sqlite-repository'
import { APP_MODE } from '@/lib/runtime/app-mode'

export const runtime = 'nodejs'

/**
 * POST /api/compile/cancel
 *
 * Cancel 是边界协议：queued/failed item 立即标记 cancelled，running item
 * 留给 in-flight pipeline 完成；因此已生成 Module 与 done checkpoint 不会被删除。
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (APP_MODE !== 'production' || !isStorageEnabled) {
    return Response.json(
      { error: 'topic-expand is only available in production storage mode' },
      {
        status: 404,
      },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsedBody = body as Record<string, unknown> | null
  const parsedJobId = parsedBody?.jobId
  if (typeof parsedJobId !== 'string' || parsedJobId.length === 0) {
    return Response.json({ error: 'Missing required field: jobId' }, { status: 400 })
  }

  const jobId = parsedJobId
  try {
    const repository = new ServerSQLiteRepository(getDb())
    const job = expandJobLibrary.get(jobId, repository)
    if (!job) return Response.json({ error: 'expand_job_not_found' }, { status: 404 })

    const plan = planTopicExpandCancellation(job)
    if (!plan.alreadyTerminal) {
      for (const itemId of plan.itemIdsToCancel) {
        expandJobLibrary.updateItem(jobId, itemId, { status: 'cancelled' }, repository)
      }
      expandJobLibrary.update(jobId, { status: 'cancelled', currentItemId: null }, repository)
    }

    const finalJob = expandJobLibrary.get(jobId, repository)
    if (!finalJob) return Response.json({ error: 'expand_job_not_found' }, { status: 404 })
    const counts = countTopicExpandItems(finalJob)
    return Response.json({
      jobId,
      status: finalJob.status,
      cancelledItemCount: counts.cancelledItems,
      completedItemCount: counts.completedItems,
      alreadyTerminal: plan.alreadyTerminal,
      cancelled: !plan.alreadyTerminal,
    })
  } catch {
    return Response.json({ error: 'expand_job_storage_unavailable' }, { status: 503 })
  }
}
