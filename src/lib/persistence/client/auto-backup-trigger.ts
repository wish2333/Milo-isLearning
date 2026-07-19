import { isShowcaseMode } from '@/lib/runtime/app-mode'

import { getProductionStorage } from './storage'

export interface AutoBackupRepository {
  flushNow: () => Promise<void>
  getFailedTasks: () => readonly unknown[]
}

/**
 * Flushes the production write queue and asks the server for an automatic
 * consistency snapshot. This is intentionally fire-and-forget from Zustand
 * actions: persistence failures must not interrupt the learning flow.
 */
export async function triggerAutoBackup(force: boolean): Promise<void> {
  if (isShowcaseMode) return

  try {
    await runAutoBackup(force, getProductionStorage())
  } catch (err: unknown) {
    console.error('[auto-backup] 自动备份失败：', err instanceof Error ? err.message : String(err))
  }
}

/** @internal Exported for unit tests; callers should use triggerAutoBackup. */
export async function runAutoBackup(force: boolean, repo: AutoBackupRepository): Promise<void> {
  try {
    await repo.flushNow()

    const failedTasks = repo.getFailedTasks()
    if (failedTasks.length > 0) {
      console.warn(`[auto-backup] 跳过自动备份：仍有 ${failedTasks.length} 个写入任务失败。`)
      return
    }

    const response = await fetch('/api/backup/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    })

    if (!response.ok) {
      console.error(`[auto-backup] 请求自动备份失败：HTTP ${response.status}`)
    }
  } catch (err: unknown) {
    console.error('[auto-backup] 自动备份失败：', err instanceof Error ? err.message : String(err))
  }
}
