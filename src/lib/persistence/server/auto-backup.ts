import 'server-only'

import { createSnapshot, listAutoBackups } from './backup'
import type { SqliteDatabase } from './db-singleton'

/** 自动快照最长间隔：严格超过 24 小时才创建新快照。 */
export const AUTO_BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface AutoBackupResult {
  created: boolean
  snapshotPath?: string
}

/**
 * 最近快照是否已超过允许的存活时间。
 *
 * 没有历史快照时立即备份；边界值恰好为 maxAge 时不备份，避免日常请求
 * 因时间精度差异重复创建快照。
 */
export function shouldBackup(
  lastSnapshotMtime: number | null | undefined,
  maxAge = AUTO_BACKUP_MAX_AGE_MS,
  now = Date.now(),
): boolean {
  return (
    lastSnapshotMtime === null ||
    lastSnapshotMtime === undefined ||
    now - lastSnapshotMtime > maxAge
  )
}

/** 强制备份优先于 24 小时阈值。 */
export function shouldCreateAutoSnapshot(
  force: boolean,
  lastSnapshotMtime: number | null | undefined,
  now = Date.now(),
): boolean {
  return force || shouldBackup(lastSnapshotMtime, AUTO_BACKUP_MAX_AGE_MS, now)
}

/**
 * 按 24 小时间隔创建 SQLite 一致性快照。
 *
 * 复用 createSnapshot：其内部以 VACUUM INTO 写出快照，并负责保留最近 10 份。
 */
export function createAutoSnapshot(
  db: SqliteDatabase,
  { force = false, now = Date.now() }: { force?: boolean; now?: number } = {},
): AutoBackupResult {
  const latestSnapshot = listAutoBackups()[0]
  if (!shouldCreateAutoSnapshot(force, latestSnapshot?.mtime, now)) {
    return { created: false }
  }

  return {
    created: true,
    snapshotPath: createSnapshot(db),
  }
}
