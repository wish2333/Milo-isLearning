/**
 * LocalStorage Repository 实现
 *
 * 对应 docs/Technical-Specification.md §6.1。
 *
 * 注意：
 *   - 所有读写都通过 try-catch 保护（SSR 环境下 localStorage 不存在）
 *   - JSON.parse 失败返回 null（数据损坏不阻断 UI）
 *   - set 失败（QuotaExceededError）抛错，由调用方决定是否触发 eviction
 */

import { STORAGE_KEY_PREFIX, isAlcKey } from '../shared/keys'
import type { StorageRepository } from '../shared/repository'

export class LocalStorageRepository implements StorageRepository {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      // JSON.parse 失败或 localStorage 不可用
      return null
    }
  }

  set<T>(key: string, value: T): void {
    const serialized = JSON.stringify(value)
    localStorage.setItem(key, serialized)
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      // localStorage 不可用（SSR），静默
    }
  }

  has(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null
    } catch {
      return false
    }
  }

  keys(): string[] {
    try {
      const result: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && isAlcKey(key)) {
          result.push(key)
        }
      }
      return result
    } catch {
      return []
    }
  }

  getRaw(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  setRaw(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      // QuotaExceededError 等，与 set() 一致向上抛
      throw e
    }
  }

  clearAll(): void {
    try {
      const alcKeys = this.keys()
      for (const key of alcKeys) {
        localStorage.removeItem(key)
      }
    } catch {
      // localStorage 不可用，静默
    }
  }
}

/** 单例实例（全局共享） */
export const storage: StorageRepository = new LocalStorageRepository()

export { STORAGE_KEY_PREFIX }
