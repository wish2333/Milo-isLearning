/**
 * Quota Management — 容量预警与显式 Module 删除
 *
 * 对应 docs/PRD.md §6.1 NFR / FR-08 AC4 和 docs/Technical-Specification.md §6.1。
 *
 * M7.6 起不再在编译或导入时静默淘汰旧题库。
 * 容量接近上限只通过 UI 提示用户导出/删除；删除必须由用户二次确认触发。
 */

import type { Module, ProgressState } from '@/types/domain'

import {
  StorageKeys,
  STORAGE_HARD_LIMIT_BYTES,
  STORAGE_MAX_HISTORY_MODULES,
  STORAGE_WARN_BYTES,
} from './keys'
import type { StorageRepository } from './repository'
import { cascadeDeleteModule } from './topic-library'

export const MAX_STORED_MODULES = 12

export interface CapacitySummary {
  moduleCount: number
  maxModules: number
  nearLimit: boolean
}

interface PersistedAttemptsState {
  state?: {
    attemptsBySlot?: Record<string, unknown>
  }
  version?: number
}

// =================================================================
// 容量计算
// =================================================================

/**
 * 计算当前 `alc:` 前缀数据占用的字节数。
 *
 * 遍历所有 alc: key，累加 key + value 的 UTF-8 字节长度。
 */
export function getStorageUsage(repo: StorageRepository): number {
  const keys = repo.keys()
  let total = 0
  for (const key of keys) {
    // key 本身的字节
    total += new Blob([key]).size
    // value 的字节（读原始字符串，不走 JSON.parse）
    const value = repo.getRaw(key)
    if (value) total += new Blob([value]).size
  }
  return total
}

/**
 * 当前用量是否超过预警阈值（4.5MB）。
 */
export function isStorageNearLimit(repo: StorageRepository): boolean {
  return getStorageUsage(repo) >= STORAGE_WARN_BYTES
}

/**
 * 当前用量是否超过硬限（5MB）。
 */
export function isStorageFull(repo: StorageRepository): boolean {
  return getStorageUsage(repo) >= STORAGE_HARD_LIMIT_BYTES
}

export function getStorageCapacitySummary(repo: StorageRepository): CapacitySummary {
  const moduleCount = listModuleIds(repo).length
  return {
    moduleCount,
    maxModules: MAX_STORED_MODULES,
    nearLimit: moduleCount >= MAX_STORED_MODULES - 1 || isStorageNearLimit(repo),
  }
}

// =================================================================
// Module 枚举与淘汰
// =================================================================

/**
 * 列出所有已存储的 Module ID（从 `alc:module:*` key 中提取）。
 */
export function listModuleIds(repo: StorageRepository): string[] {
  const prefix = `${StorageKeys.module('').slice(0, -1)}` // 'alc:module'
  return repo
    .keys()
    .filter((k) => k.startsWith(`${prefix}:`))
    .map((k) => k.slice(`${prefix}:`.length))
}

function removeGlobalAttemptsForModule(repo: StorageRepository, moduleId: string): void {
  const attemptsKey = 'alc:state:attempts'
  const persisted = repo.get<PersistedAttemptsState>(attemptsKey)
  const attemptsBySlot = persisted?.state?.attemptsBySlot
  if (!persisted || !attemptsBySlot) return

  const nextAttemptsBySlot = { ...attemptsBySlot }
  let changed = false
  for (const slotId of Object.keys(nextAttemptsBySlot)) {
    if (slotId.startsWith(`${moduleId}:`)) {
      delete nextAttemptsBySlot[slotId]
      changed = true
    }
  }

  if (!changed) return
  repo.set(attemptsKey, {
    ...persisted,
    state: {
      ...persisted.state,
      attemptsBySlot: nextAttemptsBySlot,
    },
  })
}

/**
 * 删除一个 Module 及其全部关联数据。
 *
 * 删除范围：module / source（通过 module.sourceId） / mastery / feynman /
 * progress / module-scoped attempts / quality report。
 *
 * @returns 被删除的 moduleId（若不存在则 null）
 */
export function removeModule(repo: StorageRepository, moduleId: string): string | null {
  const storedModule = repo.get<Module>(StorageKeys.module(moduleId))
  if (!storedModule) return null

  repo.remove(StorageKeys.module(moduleId))
  repo.remove(StorageKeys.source(storedModule.sourceId))
  repo.remove(StorageKeys.mastery(moduleId))
  repo.remove(StorageKeys.feynman(moduleId))
  repo.remove(StorageKeys.progress(moduleId))
  repo.remove(StorageKeys.attemptsModule(moduleId))
  repo.remove(StorageKeys.qualityReport(moduleId))
  removeGlobalAttemptsForModule(repo, moduleId)

  // M8.1：从主题中级联移除引用
  cascadeDeleteModule(moduleId)

  return moduleId
}

/**
 * 淘汰最旧的 Module（按 ProgressState.updatedAt 升序）。
 *
 * @returns 被淘汰的 moduleId，若无则 null
 */
export function evictOldestModule(repo: StorageRepository): string | null {
  const moduleIds = listModuleIds(repo)
  if (moduleIds.length === 0) return null

  // 按 progress.updatedAt 排序，无 progress 的视为 0（最旧）
  const withTimestamp = moduleIds.map((id) => {
    const progress = repo.get<ProgressState>(StorageKeys.progress(id))
    return { id, updatedAt: progress?.updatedAt ?? 0 }
  })

  withTimestamp.sort((a, b) => a.updatedAt - b.updatedAt)

  const oldest = withTimestamp[0]
  if (oldest) {
    return removeModule(repo, oldest.id)
  }
  return null
}

/**
 * Legacy compatibility hook for call sites that used to request automatic cleanup.
 *
 * It intentionally does not delete anything. Silent eviction made older题库 disappear after
 * compiling a new module, which violates the M7.6 product rule that cleanup must be explicit.
 *
 * @param repo repository kept for signature compatibility
 * @param neededBytes upcoming write size kept for future IndexedDB migration
 * @returns always empty because no module was deleted
 */
export function ensureCapacity(_repo: StorageRepository, _neededBytes = 0): string[] {
  return []
}

export {
  STORAGE_WARN_BYTES,
  STORAGE_HARD_LIMIT_BYTES,
  STORAGE_MAX_HISTORY_MODULES,
  STORAGE_MAX_HISTORY_MODULES as LEGACY_STORAGE_MAX_HISTORY_MODULES,
}
