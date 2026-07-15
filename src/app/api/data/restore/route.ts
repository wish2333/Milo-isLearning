import 'server-only'
import { type NextRequest, NextResponse } from 'next/server'

import { parseBackupPackage } from '@/lib/persistence/backup-package'
import { isStorageEnabled } from '@/lib/persistence/server/config'
import { getDb } from '@/lib/persistence/server/db-singleton'
import { createSnapshot } from '@/lib/persistence/server/backup'

export const runtime = 'nodejs'

const MAX_RESTORE_BYTES = 50 * 1024 * 1024

/**
 * POST /api/data/restore -- 灾难恢复（评审 3.2.6 定案）
 *
 * 流程：自动备份当前库 -> 清库 -> 导入备份文件，全程视为不可中断的操作。
 * 需二次确认参数 `?confirm=true`。
 *
 * 与 /api/data/import 的区别：
 *   - import：默认跳过冲突，不动现有数据
 *   - restore：覆盖式，先清空再导入，单事务语义
 *
 * Response 200: { restored, snapshotPath }
 * Response 400: 缺 confirm / 解析失败
 * Response 404: storage 未启用
 * Response 413: 超过 50 MiB
 */
export async function POST(req: NextRequest) {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  // 二次确认参数
  const url = new URL(req.url)
  const confirm = url.searchParams.get('confirm')
  if (confirm !== 'true') {
    return NextResponse.json(
      { error: '需要二次确认：请加 ?confirm=true 查询参数' },
      { status: 400 },
    )
  }

  // Content-Length 双校验
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10)
  if (contentLength > MAX_RESTORE_BYTES) {
    return NextResponse.json({ error: '请求体超过 50 MiB 上限' }, { status: 413 })
  }
  const bodyText = await req.text()
  if (Buffer.byteLength(bodyText, 'utf-8') > MAX_RESTORE_BYTES) {
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

  // Phase A：自动备份当前库（在动数据前）
  const db = getDb()
  let snapshotPath: string
  try {
    snapshotPath = createSnapshot(db)
  } catch (err) {
    return NextResponse.json(
      {
        error: '快照备份失败，恢复中止',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  // Phase B + C：清库 + 导入，全程在一个 SQLite 事务内
  let restored = 0

  try {
    db.run('BEGIN TRANSACTION')
    db.run('DELETE FROM kv')
    // v1.0.0 修复（review H3）：用直接 SQL 显式指定 updated_at，
    // 保留 BackupPackage entry 自带的时间戳，而不是用 Date.now() 覆盖。
    for (const entry of pkg.entries) {
      db.run(`INSERT OR REPLACE INTO kv (key, value, namespace, updated_at) VALUES (?, ?, ?, ?)`, [
        entry.key,
        entry.valueRaw,
        entry.namespace,
        entry.updatedAt,
      ])
      restored++
    }
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    return NextResponse.json(
      {
        error: '恢复过程中出错，已回滚，原数据未受影响',
        detail: err instanceof Error ? err.message : String(err),
        snapshotPath,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    restored,
    snapshotPath,
    totalEntries: pkg.entries.length,
  })
}
