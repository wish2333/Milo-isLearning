import 'server-only'
import { NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'

export const runtime = 'nodejs'

/**
 * POST /api/data/flush -- 强制落盘（Phase 2 才有真正的写队列 flush 语义）
 *
 * 当前 SQLite 默认每个 commit 都 fsync，无需额外 flush。
 * Phase 2 会扩展为：触发 WAL checkpoint + 等待所有 pending write 完成。
 */
export async function POST() {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }
  return NextResponse.json({ flushed: true })
}
