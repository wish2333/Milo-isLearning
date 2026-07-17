import 'server-only'
import { type NextRequest, NextResponse } from 'next/server'

import { createAutoSnapshot } from '@/lib/persistence/server/auto-backup'
import { isStorageEnabled } from '@/lib/persistence/server/config'
import { getDb } from '@/lib/persistence/server/db-singleton'

export const runtime = 'nodejs'

function parseForce(body: unknown): boolean | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null
  }

  const force = (body as Record<string, unknown>).force
  return force === undefined ? false : typeof force === 'boolean' ? force : null
}

/**
 * POST /api/backup/auto -- 触发 SQLite 自动快照。
 *
 * Body: { force?: boolean }
 * force=true 始终创建；否则仅在最近一致性快照严格超过 24 小时时创建。
 */
export async function POST(req: NextRequest) {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 })
  }

  const force = parseForce(body)
  if (force === null) {
    return NextResponse.json({ error: 'force 必须是布尔值' }, { status: 400 })
  }

  try {
    const result = createAutoSnapshot(getDb(), { force })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      {
        error: '自动快照创建失败',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
