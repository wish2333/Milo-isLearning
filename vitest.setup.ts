/**
 * vitest 全局 setup — 提供 localStorage / sessionStorage stub
 *
 * 背景：v1.0.0 把 store 默认 persist 从 ClientFetchStorageRepository（production）
 * 改回 LocalStorageRepository（showcase 默认）后，store 测试在 Node 环境
 * （无 localStorage）会抛 ReferenceError。
 *
 * 这里提供最小 localStorage / sessionStorage stub，让 store persist 的
 * setItem/getItem 不抛错。具体测试如需特定行为可覆盖 stubGlobal。
 */

class MemoryStorage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
}

// 仅当全局未定义时安装 stub（避免覆盖 jsdom 等环境的真实实现）
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
}

if (typeof globalThis.sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
}
