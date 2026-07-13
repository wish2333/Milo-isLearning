import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import {
  commitSession,
  validateSession,
  getSession,
} from '@/lib/persistence/server/migration-staging'
import { writeLog, pruneOldLogs } from '@/lib/persistence/server/migration-logs'

export const runtime = 'nodejs'

/**
 * POST /api/migrate/commit -- 提交迁移（单事务）
 *
 * Body: { sessionId: string }
 *
 * 流程：
 *   1. validateSession（条数 + JSON 合法性）
 *   2. commitSession（staging -> kv + 写 meta + 清 staging）
 *   3. 写日志
 *
 * Response 200: { committedEntries, skippedConflicts }
 * Response 400: 校验失败 / session 状态错误
 */
export async function POST(req: NextRequest) {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  let body: { sessionId?: string }
  try {
    body = (await req.json()) as { sessionId?: string }
  } catch {
    return NextResponse.json({ error: '无效 JSON' }, { status: 400 })
  }

  if (!body.sessionId) {
    return NextResponse.json({ error: '缺少 sessionId' }, { status: 400 })
  }

  const session = getSession(body.sessionId)
  if (!session) {
    return NextResponse.json({ error: 'session 不存在' }, { status: 404 })
  }

  writeLog(body.sessionId, {
    event: 'commit_start',
    sessionId: body.sessionId,
  })

  // Phase 1: 校验
  try {
    validateSession(body.sessionId)
    writeLog(body.sessionId, { event: 'validate_passed' })
  } catch (err) {
    writeLog(body.sessionId, {
      event: 'validate_failed',
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      {
        error: '校验失败：' + (err instanceof Error ? err.message : String(err)),
      },
      { status: 400 },
    )
  }

  // Phase 2: commit
  try {
    const result = commitSession(body.sessionId)
    writeLog(body.sessionId, { event: 'commit_success', ...result })
    pruneOldLogs()
    return NextResponse.json(result)
  } catch (err) {
    writeLog(body.sessionId, {
      event: 'commit_failed',
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      {
        error: 'commit 失败：' + (err instanceof Error ? err.message : String(err)),
      },
      { status: 500 },
    )
  }
}
