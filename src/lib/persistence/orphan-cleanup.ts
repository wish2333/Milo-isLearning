/**
 * 孤儿引用检测与清理
 *
 * progress-store (Zustand persist key `alc:state:progress`) 持有 state.moduleId，
 * 指向当前学习的 module。如果 alc:module:{moduleId} 不存在（删除、迁移丢失等），
 * 则该引用为"孤儿"——UI 可能尝试加载不存在的 module。
 *
 * 本模块提供 detect + cleanup 两个纯函数，通过 StorageRepository 操作，
 * 不直接接触 localStorage。
 */

import type { StorageRepository } from './shared/repository'
import { StorageKeys } from './shared/keys'

/** Zustand persist key for progress-store (store-level key, 不在 StorageKeys 中) */
const PROGRESS_STORE_KEY = 'alc:state:progress'

export interface OrphanReport {
  /** progress-store.state.moduleId 指向不存在的 module */
  orphanProgressModuleIds: string[]
}

/**
 * 检测孤儿引用：progress-store 的 moduleId 指向的 module 不存在。
 *
 * 检查链：
 *   alc:state:progress -> { state: { moduleId } } -> alc:module:{moduleId} 是否存在
 */
export function detectOrphans(repo: StorageRepository): OrphanReport {
  const progressRaw = repo.getRaw(PROGRESS_STORE_KEY)
  if (!progressRaw) return { orphanProgressModuleIds: [] }

  let parsed: { state?: { moduleId?: string } }
  try {
    parsed = JSON.parse(progressRaw)
  } catch {
    return { orphanProgressModuleIds: [] }
  }

  const moduleId = parsed.state?.moduleId
  if (!moduleId) return { orphanProgressModuleIds: [] }

  // 检查 module 是否存在
  if (repo.has(StorageKeys.module(moduleId))) return { orphanProgressModuleIds: [] }

  return { orphanProgressModuleIds: [moduleId] }
}

/**
 * 清理孤儿引用：移除 progress-store 中的 moduleId 引用。
 * 不删除任何 module 数据（因为 module 本身就不存在）。
 *
 * 清理后 progress-store.state.moduleId 变为空字符串，
 * 客户端会回到"未开始学习"状态。
 */
export function cleanupOrphans(repo: StorageRepository, report: OrphanReport): void {
  if (report.orphanProgressModuleIds.length === 0) return

  const progressRaw = repo.getRaw(PROGRESS_STORE_KEY)
  if (!progressRaw) return

  let parsed: { state?: Record<string, unknown>; version?: number }
  try {
    parsed = JSON.parse(progressRaw)
  } catch {
    return
  }

  if (!parsed.state) return

  // 清除孤儿 moduleId 及相关 module 级状态字段
  const cleanedState = { ...parsed.state }
  delete cleanedState.moduleId
  delete cleanedState.stage
  delete cleanedState.feynmanAttempt

  repo.setRaw(
    PROGRESS_STORE_KEY,
    JSON.stringify({ state: cleanedState, version: parsed.version ?? 0 }),
  )
}
