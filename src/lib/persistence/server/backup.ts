import 'server-only'

import type { SqliteDatabase } from './db-singleton'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/**
 * SQLite 一致性快照（评审 3.2.6 + R-H7 定案）
 *
 * 使用 `VACUUM INTO` 而不是直接拷贝 db 文件——VACUUM INTO 会写入
 * 一个全新的、自洽的、单文件的 db 副本，包含所有 WAL 中未 checkpoint 的数据。
 *
 * 自动保留最近 10 个备份，超出删最旧。
 */

const BACKUP_DIR = 'data/backup'
const MAX_AUTO_BACKUPS = 10

/**
 * 创建一致性快照。返回快照文件路径。
 *
 * 文件名：`alc-snapshot-YYYYMMDD-HHmmss.db`
 */
export function createSnapshot(db: SqliteDatabase): string {
  mkdirSync(BACKUP_DIR, { recursive: true })

  const ts = formatTimestamp(new Date())
  const path = join(BACKUP_DIR, `alc-snapshot-${ts}.db`)

  // VACUUM INTO 必须用字符串插值（SQLite 不支持 ? 占位符）
  // Windows 路径用 / 也可以（SQLite 接受），需转义单引号
  const safePath = path.replace(/\\/g, '/').replace(/'/g, "''")
  db.run(`VACUUM INTO '${safePath}';`)

  pruneOldAutoBackups()

  return path
}

/**
 * 清理超出 MAX_AUTO_BACKUPS 的最旧自动备份。
 * 用户手动备份永不自动删（评审 6.3）。
 *
 * 当前简化实现：所有 alc-snapshot-*.db 都视为自动备份。
 * Phase 5 的 LS 来源快照用不同前缀（alc-ls-snapshot-*），不会被这里删。
 */
function pruneOldAutoBackups(): void {
  let files: string[]
  try {
    files = readdirSync(BACKUP_DIR)
  } catch {
    return
  }

  const snapshots = files
    .filter((f) => f.startsWith('alc-snapshot-') && f.endsWith('.db'))
    .map((f) => ({
      name: f,
      path: join(BACKUP_DIR, f),
      mtime: safeMtime(join(BACKUP_DIR, f)),
    }))
    .sort((a, b) => b.mtime - a.mtime)

  for (const snap of snapshots.slice(MAX_AUTO_BACKUPS)) {
    try {
      unlinkSync(snap.path)
      console.info(`[backup] 清理旧自动备份：${snap.name}`)
    } catch {
      // 静默
    }
  }
}

function safeMtime(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
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

/**
 * 列出当前所有自动备份（用于 UI 展示历史备份列表）。
 */
export function listAutoBackups(): Array<{
  name: string
  path: string
  sizeBytes: number
  mtime: number
}> {
  let files: string[]
  try {
    files = readdirSync(BACKUP_DIR)
  } catch {
    return []
  }
  return files
    .filter((f) => f.startsWith('alc-snapshot-') && f.endsWith('.db'))
    .map((f) => {
      const filePath = join(BACKUP_DIR, f)
      let sizeBytes = 0
      let mtime = 0
      try {
        const stat = statSync(filePath)
        sizeBytes = stat.size
        mtime = stat.mtimeMs
      } catch {
        // 静默
      }
      return { name: f, path: filePath, sizeBytes, mtime }
    })
    .sort((a, b) => b.mtime - a.mtime)
}
