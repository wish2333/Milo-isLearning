import 'server-only'
import { NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { getServerRepo } from '../_lib/repo-singleton'
import type { ServerSQLiteRepository } from '@/lib/persistence/server/sqlite-repository'

export const runtime = 'nodejs'

const MAX_BULK_BYTES = 50 * 1024 * 1024 // 50 MiB 上限（评审 D3 定案）

/**
 * GET /api/data/bulk -- 一次拉全量，用于 client 启动时填充 cache。
 *
 * Response 200: { entries: [[key, valueRaw], ...], revision, stats }
 * Response 404: { enabled: false }
 * Response 413: 超过 50 MiB 上限
 */
export async function GET() {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }
  const repo = getServerRepo() as ServerSQLiteRepository
  const entries = repo.dumpAll()
  const totalBytes = repo.totalBytes()
  if (totalBytes > MAX_BULK_BYTES) {
    return NextResponse.json(
      {
        error: '全量数据超过 50 MiB 上限，请使用导出功能',
        totalBytes,
        limit: MAX_BULK_BYTES,
      },
      { status: 413 },
    )
  }
  return NextResponse.json({
    entries,
    revision: Date.now(),
    stats: {
      totalEntries: entries.length,
      totalBytes,
    },
  })
}
