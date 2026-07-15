import 'server-only'
import { NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { getDb } from '@/lib/persistence/server/db-singleton'
import { CURRENT_SCHEMA_VERSION } from '@/lib/persistence/server/schema'

export const runtime = 'nodejs'

/**
 * GET /api/data/status -- 健康检查 + 容量统计
 *
 * Response 200: { enabled: true, schemaVersion, stats: { totalEntries, totalBytes } }
 * Response 404: { enabled: false }  （fail-closed 双开关未启用）
 */
export async function GET() {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }
  const db = getDb()
  const cntRow = db.query('SELECT COUNT(*) AS cnt FROM kv').get() as { cnt?: number }
  const bytesRow = db
    .query(`SELECT COALESCE(SUM(LENGTH(key) + LENGTH(value)), 0) AS bytes FROM kv`)
    .get() as { bytes?: number }
  return NextResponse.json({
    enabled: true,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    stats: {
      totalEntries: cntRow.cnt ?? 0,
      totalBytes: bytesRow.bytes ?? 0,
    },
  })
}
