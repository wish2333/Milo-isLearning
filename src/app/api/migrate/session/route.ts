import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { createSession, MigrationConflictError } from '@/lib/persistence/server/migration-staging'

export const runtime = 'nodejs'

/**
 * POST /api/migrate/session -- 创建 migration session
 *
 * Body: { sourceFingerprint: string, totalEntries: number }
 * Response 200: { sessionId, status, totalEntries, uploadedEntries }
 * Response 404: storage 未启用
 * Response 409: 重复迁移（fingerprint 已存在）
 * Response 400: 参数缺失
 */
export async function POST(req: NextRequest) {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  let body: { sourceFingerprint?: string; totalEntries?: number }
  try {
    body = (await req.json()) as {
      sourceFingerprint?: string
      totalEntries?: number
    }
  } catch {
    return NextResponse.json({ error: '无效 JSON' }, { status: 400 })
  }

  if (!body.sourceFingerprint || typeof body.totalEntries !== 'number') {
    return NextResponse.json({ error: '缺少 sourceFingerprint 或 totalEntries' }, { status: 400 })
  }

  try {
    const session = createSession(body.sourceFingerprint, body.totalEntries)
    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      totalEntries: session.totalEntries,
      uploadedEntries: session.uploadedEntries,
    })
  } catch (err) {
    if (err instanceof MigrationConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    throw err
  }
}
