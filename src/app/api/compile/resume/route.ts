import 'server-only'
import { type NextRequest, NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { APP_MODE } from '@/lib/runtime/app-mode'
import { getDb } from '@/lib/persistence/server/db-singleton'
import { getResumptionData } from '@/lib/persistence/server/compile-checkpoint'

export const runtime = 'nodejs'

/** 解析真实 Host，处理反代转发场景 */
function resolveForwardedHost(req: NextRequest): string | null {
  const xfh = req.headers.get('x-forwarded-host')
  if (xfh) {
    const first = xfh.split(',')[0]
    if (first) return first.trim()
  }
  const forwarded = req.headers.get('forwarded')
  if (forwarded) {
    const match = /host="?([^;,\s]+)"?/i.exec(forwarded)
    if (match?.[1]) return match[1].trim()
  }
  return req.headers.get('host')
}

/** 同源校验 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const expectedHost = resolveForwardedHost(req)
  if (!expectedHost) return false
  return originHost === expectedHost
}

/**
 * GET /api/compile/resume?sessionId=<id> -- 查询 resume 所需的 checkpoint 数据
 *
 * Response: { lastStage: string | null, checkpoints: Record<string, { artifact, usage? }> }
 */
export async function GET(req: NextRequest) {
  if (APP_MODE !== 'production') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isStorageEnabled) {
    return NextResponse.json({ error: 'Storage not enabled' }, { status: 503 })
  }

  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 })
  }

  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId || sessionId.length === 0) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const db = getDb()
  const { lastStage, checkpoints } = getResumptionData(db, sessionId)

  // 序列化 Map 为 plain object
  const checkpointsObj: Record<string, unknown> = {}
  for (const [stage, data] of checkpoints) {
    checkpointsObj[stage] = data
  }

  return NextResponse.json({ lastStage, checkpoints: checkpointsObj })
}
