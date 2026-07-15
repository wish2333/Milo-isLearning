import 'server-only'
import { NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { getServerRepo } from '../_lib/repo-singleton'

export const runtime = 'nodejs'

/**
 * POST /api/data/clear -- 清空 kv 表全部 alc: 数据
 *
 * 危险操作。调用方必须二次确认。
 * 灾难恢复流程在 Phase 4 实现，本 endpoint 仅供内部使用。
 */
export async function POST() {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }
  const repo = getServerRepo()
  repo.clearAll()
  return NextResponse.json({ cleared: true })
}
