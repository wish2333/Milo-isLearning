import 'server-only'
import { type NextRequest, NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { parseBackupPackage } from '@/lib/persistence/backup-package'
import { getServerRepo } from '../_lib/repo-singleton'
import type { ServerSQLiteRepository } from '@/lib/persistence/server/sqlite-repository'

export const runtime = 'nodejs'

const MAX_IMPORT_BYTES = 50 * 1024 * 1024 // 50 MiB 上限

/**
 * POST /api/data/import -- 普通导入（评审 3.2.6 D8 定案）
 *
 * 默认冲突策略：**跳过**（同 key 不覆盖）
 * 不自动备份（用户需自行 export 后再 import）
 *
 * Request body: BackupPackageV1 JSON
 * Response 200: { imported: number, skipped: number }
 * Response 400: JSON 解析失败 / schema 不匹配 / checksum 不匹配
 * Response 404: storage 未启用
 * Response 413: 超过 50 MiB
 */
export async function POST(req: NextRequest) {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  // Content-Length 双校验
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10)
  if (contentLength > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: '请求体超过 50 MiB 上限' }, { status: 413 })
  }

  const bodyText = await req.text()
  if (Buffer.byteLength(bodyText, 'utf-8') > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: '请求体超过 50 MiB 上限' }, { status: 413 })
  }

  // 解析 BackupPackage
  let pkg
  try {
    pkg = parseBackupPackage(bodyText)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '解析失败' },
      { status: 400 },
    )
  }

  // 执行导入（跳过冲突）
  const repo = getServerRepo() as ServerSQLiteRepository
  let imported = 0
  let skipped = 0

  for (const entry of pkg.entries) {
    if (repo.has(entry.key)) {
      skipped++
      continue
    }
    repo.setRaw(entry.key, entry.valueRaw)
    imported++
  }

  return NextResponse.json({
    imported,
    skipped,
    total: pkg.entries.length,
  })
}
