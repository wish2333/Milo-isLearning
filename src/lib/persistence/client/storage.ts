import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { LocalStorageRepository, storage as legacyStorage } from './local-storage'
import { ClientFetchStorageRepository } from './client-fetch-storage'
import type { StorageRepository } from '../shared/repository'

/**
 * 浏览器端 storage 入口（按 mode 选择实现）
 *
 * showcase 模式：LocalStorageRepository（5 MB / 12 题上限，无 server）
 * production 模式：ClientFetchStorageRepository（cache + WriteQueue -> SQLite）
 *
 * 注意：production 模式下 ClientFetchStorageRepository 内部 cache 初始为空，
 * 需要 StorageInitializer 调用 loadFromServer() 后才能用。
 */

let productionRepo: ClientFetchStorageRepository | null = null
let showcaseRepo: LocalStorageRepository | null = null

/** 获取当前 storage 实现。 */
export function getStorage(): StorageRepository {
  if (isShowcaseMode) {
    if (!showcaseRepo) showcaseRepo = new LocalStorageRepository()
    return showcaseRepo
  }
  if (!productionRepo) productionRepo = new ClientFetchStorageRepository()
  return productionRepo
}

/** 获取 production ClientFetchStorageRepository（server-backed）。 */
export function getProductionStorage(): ClientFetchStorageRepository {
  if (isShowcaseMode) {
    throw new Error('[storage] getProductionStorage() 在 showcase 模式下不可用。')
  }
  if (!productionRepo) productionRepo = new ClientFetchStorageRepository()
  return productionRepo
}

/**
 * 返回当前 repository 与旧浏览器 LocalStorage 的 key 并集。
 * production 首次启动时，旧题库可能尚未被按 id 读取，因此仅枚举 SQLite
 * cache 会让主题引用的历史 Module 在题库页“消失”。
 */
export function getStorageKeysWithLegacyFallback(): string[] {
  const currentKeys = getStorage().keys()
  if (isShowcaseMode) return currentKeys
  return [...new Set([...currentKeys, ...legacyStorage.keys()])]
}

/**
 * 读取 production 数据，并兼容 V2.1.3 之前误写入 browser LocalStorage 的记录。
 * 读取到旧记录时会立即回填 production cache，并由写队列异步落盘。
 */
export function getStorageValueWithLegacyFallback<T>(
  key: string,
  mergeLegacy?: (current: T, legacy: T) => T,
): T | null {
  const repository = getStorage()
  const current = repository.get<T>(key)
  if (isShowcaseMode) return current

  const legacy = legacyStorage.get<T>(key)
  if (current !== null) {
    if (!mergeLegacy || legacy === null) return current
    const merged = mergeLegacy(current, legacy)
    if (JSON.stringify(merged) !== JSON.stringify(current)) repository.set(key, merged)
    return merged
  }
  if (legacy === null) return null

  repository.set(key, legacy)
  return legacy
}
