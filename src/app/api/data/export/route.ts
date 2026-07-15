import 'server-only'
import { NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { CURRENT_SCHEMA_VERSION } from '@/lib/persistence/server/schema'
import {
  buildBackupPackage,
  countModulesInEntries,
  sanitizeEntriesForExport,
  serializeBackupPackage,
} from '@/lib/persistence/backup-package'
import { getServerRepo } from '../_lib/repo-singleton'
import type { ServerSQLiteRepository } from '@/lib/persistence/server/sqlite-repository'

export const runtime = 'nodejs'

const MAX_EXPORT_BYTES = 50 * 1024 * 1024 // 50 MiB 上限（评审 D9）

/**
 * GET /api/data/export -- 全库导出为 BackupPackageV1 JSON
 *
 * Response 200: application/json，BackupPackageV1 序列化字符串
 * Response 404: storage 未启用
 * Response 413: 超过 50 MiB 上限
 */
export async function GET() {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  const repo = getServerRepo() as ServerSQLiteRepository
  const rawEntries = repo.dumpAll()
  const totalBytes = repo.totalBytes()

  if (totalBytes > MAX_EXPORT_BYTES) {
    return NextResponse.json(
      {
        error: '全库数据超过 50 MiB 上限',
        totalBytes,
        limit: MAX_EXPORT_BYTES,
      },
      { status: 413 },
    )
  }

  // 安全过滤（剔除 settings apiKey）
  const sanitized = sanitizeEntriesForExport(rawEntries)

  const pkg = buildBackupPackage({
    entries: sanitized,
    appMode: 'production',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    moduleCount: countModulesInEntries(sanitized),
  })

  const body = serializeBackupPackage(pkg)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="alc-backup-${Date.now()}.json"`,
    },
  })
}
