import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { LocalStorageRepository } from './local-storage'
import { ClientFetchStorageRepository } from './client-fetch-storage'
import type { StorageRepository } from '../shared/repository'

/**
 * 浏览器端 storage 入口（按 mode 选择实现）
 *
 * showcase 模式：LocalStorageRepository（5 MB / 12 题上限，无 server）
 * production 模式：ClientFetchStorageRepository（cache + WriteQueue -> SQLite）
 *
 * 评审 3.1 目标状态：
 *   showcase: Client -> LocalStorageRepository -> window.localStorage
 *   production: Client -> ClientFetchStorageRepository -> /api/data/* -> SQLite
 *
 * 注意：本模块导出 getStorage() 是同步实例化的。production 模式下
 * ClientFetchStorageRepository 内部 cache 初始为空，需要 StorageInitializer
 * （Phase 3）调用 loadFromServer() 后才能用。
 */

let productionRepo: ClientFetchStorageRepository | null = null
const showcaseRepo = isShowcaseMode ? new LocalStorageRepository() : null

/**
 * 获取当前 storage 实现。
 *
 * showcase 模式：返回单例 LocalStorageRepository。
 * production 模式：返回单例 ClientFetchStorageRepository（cache + 队列状态共享）。
 *
 * 单例通过函数获取，而不是顶层 const，是为了避免 SSR 时立即求值。
 */
export function getStorage(): StorageRepository {
  if (showcaseRepo) return showcaseRepo
  if (!productionRepo) {
    productionRepo = new ClientFetchStorageRepository()
  }
  return productionRepo
}

/**
 * 获取 ClientFetchStorageRepository 实例（production 模式专用）。
 * 用于 StorageInitializer 调用 loadFromServer / flushNow 等。
 * showcase 模式调用抛错（不应该走到）。
 */
export function getProductionStorage(): ClientFetchStorageRepository {
  if (showcaseRepo) {
    throw new Error('[storage] getProductionStorage() 在 showcase 模式下不可用。')
  }
  if (!productionRepo) {
    productionRepo = new ClientFetchStorageRepository()
  }
  return productionRepo
}
