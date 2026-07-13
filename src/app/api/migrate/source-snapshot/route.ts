import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import {
  parseBackupPackage,
  serializeBackupPackage,
  buildBackupPackage,
  sanitizeEntriesForExport,
  countModulesInEntries,
  type BackupPackageV1,
} from '@/lib/persistence/backup-package'

export const runtime = 'nodejs'

const BACKUP_DIR = 'data/backup'
const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024

/**
 * POST /api/migrate/source-snapshot -- 接收客户端上传的 LS 来源快照
 *
 * 接受两种 body 格式：
 *   1. { source: 'legacy-local-storage', entries: [{key, value}, ...] }
 *      客户端 migration.ts 上传——server 端负责 buildBackupPackage（含 checksum）
 *      + sanitizeEntriesForExport（剔除 apiKey）。
 *      原因：buildBackupPackage 内部用 node:crypto，不能进 client bundle。
 *
 *   2. BackupPackageV1 JSON（向后兼容 Phase 4 测试和直接调用）
 *      server 端只 parseBackupPackage 校验后保存。
 *
 * Response 200: { saved, path, entries }
 * Response 400: 解析失败 / checksum 不匹配
 * Response 413: 超过 50 MiB
 */
export async function POST(req: NextRequest) {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10)
  if (contentLength > MAX_SNAPSHOT_BYTES) {
    return NextResponse.json({ error: '快照超过 50 MiB 上限' }, { status: 413 })
  }

  const text = await req.text()
  if (Buffer.byteLength(text, 'utf-8') > MAX_SNAPSHOT_BYTES) {
    return NextResponse.json({ error: '快照超过 50 MiB 上限' }, { status: 413 })
  }

  // 尝试解析为 { source, entries[] } 格式（client migration.ts 上传）
  let pkg: BackupPackageV1
  try {
    const parsed = JSON.parse(text) as unknown

    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'source' in parsed &&
      'entries' in parsed &&
      !('version' in parsed)
    ) {
      // 格式 1：raw entries
      const rawBody = parsed as {
        source: string
        entries: Array<{ key: string; value: string }>
      }
      const tupleEntries: Array<[string, string]> = rawBody.entries.map((e) => [e.key, e.value])
      const sanitized = sanitizeEntriesForExport(tupleEntries)
      pkg = buildBackupPackage({
        entries: sanitized,
        appMode: 'production',
        schemaVersion: 1,
        moduleCount: countModulesInEntries(sanitized),
      })
    } else {
      // 格式 2：BackupPackageV1 JSON
      pkg = parseBackupPackage(text)
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '解析失败' },
      { status: 400 },
    )
  }

  mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = formatTimestamp(new Date())
  const filePath = join(BACKUP_DIR, `alc-ls-snapshot-${ts}.json`)
  writeFileSync(filePath, serializeBackupPackage(pkg), 'utf8')

  return NextResponse.json({
    saved: true,
    path: filePath,
    entries: pkg.entries.length,
  })
}

function formatTimestamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
}
