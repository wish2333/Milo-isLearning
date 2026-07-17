import 'server-only'

import { NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { listAutoBackups } from '@/lib/persistence/server/backup'
import { verifyLatestBackup } from '@/lib/persistence/server/backup-verify'

export const runtime = 'nodejs'

/**
 * GET /api/backup/verify -- 校验最近一份 SQLite 自动快照。
 *
 * 展示模式及未启用 SQLite 时保持 fail-closed，与其它 production-only API 一致。
 */
export async function GET() {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  const latestBackup = listAutoBackups()[0]
  return NextResponse.json(verifyLatestBackup(latestBackup))
}
