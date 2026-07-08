/**
 * Quota Management — 容量预警与历史 Module 淘汰
 *
 * 对应 docs/PRD.md §6.1 NFR / FR-08 AC4 和 docs/Technical-Specification.md §6.1。
 *
 * 策略：
 *   1. 预警阈值 STORAGE_WARN_BYTES（4.5MB）→ UI 提示用户
 *   2. 硬限 STORAGE_HARD_LIMIT_BYTES（5MB）→ 写入前触发 eviction
 *   3. 历史 Module 数超过 STORAGE_MAX_HISTORY_MODULES（3）→ 淘汰最旧
 *
 * 淘汰顺序：按 ProgressState.updatedAt 升序（最久未访问的先淘汰）。
 * 淘汰一个 Module 时连带清除其全部关联数据：
 *   source / module / mastery / attempts(每道题) / feynman / progress
 */

import type { ProgressState } from '@/types/domain'

import {
  StorageKeys,
  STORAGE_HARD_LIMIT_BYTES,
  STORAGE_MAX_HISTORY_MODULES,
  STORAGE_WARN_BYTES,
} from './keys'
import type { StorageRepository } from './repository'

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

/**
 * 删除一个 Module 及其全部关联数据。
 *
 * 需要扫描所有 `alc:attempts:*` key，因为 attempts 是按 quizId 存储的，
 * 而 quizId 包含 conceptId，conceptId 包含 moduleId 信息。
 * 但 quizId 格式为 `concept-N:slot-N`，不含 moduleId，无法直接反查。
 *
 * 因此淘汰策略：删除 module / source / mastery / feynman / progress，
 * attempts 留待下次写入时的 quota 触发清理（或在 clearAll 中统一清除）。
 *
 * @returns 被删除的 moduleId（若不存在则 null）
 */
export function removeModule(repo: StorageRepository, moduleId: string): string | null {
  if (!repo.has(StorageKeys.module(moduleId))) return null

  repo.remove(StorageKeys.module(moduleId))
  repo.remove(StorageKeys.source(moduleId))
  repo.remove(StorageKeys.mastery(moduleId))
  repo.remove(StorageKeys.feynman(moduleId))
  repo.remove(StorageKeys.progress(moduleId))

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
 * 确保有足够的容量写入即将到来的数据。
 *
 * 策略：
 *   1. 若 Module 数已超过 MAX_HISTORY_MODULES → 淘汰最旧的
 *   2. 若用量仍超过预警阈值 → 继续淘汰直到低于阈值或无 Module 可淘汰
 *
 * @param neededBytes 即将写入的数据量预估（当前未使用，预留扩展）
 * @returns 被淘汰的 moduleId 列表（可能为空）
 */
export function ensureCapacity(repo: StorageRepository, neededBytes = 0): string[] {
  const evicted: string[] = []

  // Step 1: 超过历史 Module 数限制 → 淘汰最旧的
  while (listModuleIds(repo).length > STORAGE_MAX_HISTORY_MODULES) {
    const evictedId = evictOldestModule(repo)
    if (evictedId) {
      evicted.push(evictedId)
    } else {
      break
    }
  }

  // Step 2: 用量超过预警阈值 → 继续淘汰
  const projectedUsage = getStorageUsage(repo) + neededBytes
  if (projectedUsage > STORAGE_WARN_BYTES) {
    while (getStorageUsage(repo) > STORAGE_WARN_BYTES && listModuleIds(repo).length > 0) {
      const evictedId = evictOldestModule(repo)
      if (evictedId) {
        evicted.push(evictedId)
      } else {
        break
      }
    }
  }

  return evicted
}

export { STORAGE_WARN_BYTES, STORAGE_HARD_LIMIT_BYTES, STORAGE_MAX_HISTORY_MODULES }
