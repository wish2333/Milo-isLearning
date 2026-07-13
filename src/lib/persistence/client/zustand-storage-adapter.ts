import type { StateStorage } from 'zustand/middleware'

import type { StorageRepository } from '../shared/repository'

/**
 * StorageRepository -> zustand persist StateStorage 桥接
 *
 * zustand persist 的 `storage: createJSONStorage(() => adapter)` 期望 adapter 实现：
 *   - getItem(key) -> string | null  （读取已序列化的 JSON 字符串）
 *   - setItem(key, value)           （value 是已序列化的 JSON 字符串）
 *   - removeItem(key)
 *
 * 我们的 StorageRepository：
 *   - getRaw(key) -> string | null   （未 JSON.parse 的原始字符串）
 *   - setRaw(key, value)            （value 是已序列化的字符串）
 *   - remove(key)
 *
 * 完美 1:1 桥接——getRaw <-> getItem、setRaw <-> setItem、remove <-> removeItem。
 * zustand 不需要走 get/set（不重复 JSON.stringify）。
 */

export function createZustandStorage(repo: StorageRepository): StateStorage {
  return {
    getItem: (key: string): string | null => repo.getRaw(key),
    setItem: (key: string, value: string): void => repo.setRaw(key, value),
    removeItem: (key: string): void => repo.remove(key),
  }
}
