import 'server-only'

import { existsSync } from 'node:fs'

import { createSqliteDb } from './db-singleton'

export interface BackupVerificationResult {
  valid: boolean
  backupPath: string | null
  integrityCheck: string
  error?: string
}

interface IntegrityCheckRow {
  integrity_check: string
}

/**
 * 对指定 SQLite 快照执行完整性检查。
 *
 * 快照由 VACUUM INTO 生成，因此这里仅打开并读取，不会触碰在线数据库。
 */
export function verifyBackupFile(backupPath: string): BackupVerificationResult {
  let db: ReturnType<typeof createSqliteDb> | null = null

  try {
    // better-sqlite3 会在路径不存在时创建新库；先检查文件，避免删除竞态被误报为有效空库。
    if (!existsSync(backupPath)) {
      return {
        valid: false,
        backupPath,
        integrityCheck: 'missing',
        error: '备份文件不存在',
      }
    }

    db = createSqliteDb(backupPath)
    const rows = db.query<IntegrityCheckRow>('PRAGMA integrity_check').all()
    const checks = rows.map((row) => row.integrity_check).filter((value) => value.length > 0)
    const integrityCheck = checks.join('; ') || 'unknown'

    return {
      valid: checks.length > 0 && checks.every((value) => value === 'ok'),
      backupPath,
      integrityCheck,
    }
  } catch (error) {
    return {
      valid: false,
      backupPath,
      integrityCheck: 'error',
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    db?.close()
  }
}

/**
 * 校验最近一份自动快照；没有快照时返回可展示的失败结果，而不是抛错。
 */
export function verifyLatestBackup(
  latestBackup: { path: string } | undefined,
): BackupVerificationResult {
  if (!latestBackup) {
    return {
      valid: false,
      backupPath: null,
      integrityCheck: 'missing',
      error: '未找到可验证的自动备份快照',
    }
  }

  return verifyBackupFile(latestBackup.path)
}
