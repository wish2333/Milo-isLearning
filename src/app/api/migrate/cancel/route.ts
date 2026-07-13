import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { cancelSession } from '@/lib/persistence/server/migration-staging'
import { writeLog } from '@/lib/persistence/server/migration-logs'

export const runtime = 'nodejs'

/**
 * POST /api/migrate/cancel -- 取消未 commit 的 session
 *
 * Body: { sessionId: string }
 * Response 200: { cancelled: true }
 * Response 400: session 已 completed
 * Response 404: session 不存在
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

  try {
    cancelSession(body.sessionId)
    writeLog(body.sessionId, { event: 'cancelled' })
    return NextResponse.json({ cancelled: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = message.includes('不存在') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
