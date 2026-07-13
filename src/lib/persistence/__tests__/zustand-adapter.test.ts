import { describe, it, expect } from 'vitest'
import type { StorageRepository } from '../shared/repository'
import { createZustandStorage } from '../client/zustand-storage-adapter'

function makeMockRepo(): StorageRepository & {
  _raw: Map<string, string>
} {
  const raw = new Map<string, string>()
  return {
    _raw: raw,
    get: <T>(key: string): T | null => {
      const v = raw.get(key)
      return v ? (JSON.parse(v) as T) : null
    },
    set: <T>(key: string, value: T): void => {
      raw.set(key, JSON.stringify(value))
    },
    setRaw: (key: string, value: string): void => {
      raw.set(key, value)
    },
    remove: (key: string): void => {
      raw.delete(key)
    },
    has: (key: string): boolean => raw.has(key),
    keys: (): string[] => Array.from(raw.keys()),
    getRaw: (key: string): string | null => raw.get(key) ?? null,
    clearAll: (): void => raw.clear(),
  }
}

describe('createZustandStorage', () => {
  it('getItem 映射到 getRaw', () => {
    const repo = makeMockRepo()
    repo.setRaw('zustand-test', '{"foo":1}')
    const adapter = createZustandStorage(repo)
    expect(adapter.getItem('zustand-test')).toBe('{"foo":1}')
  })

  it('setItem 映射到 setRaw（不 JSON.stringify 二次包装）', () => {
    const repo = makeMockRepo()
    const adapter = createZustandStorage(repo)
    adapter.setItem('k', '{"a":1}')
    expect(repo._raw.get('k')).toBe('{"a":1}') // 直接存原字符串
  })

  it('removeItem 映射到 remove', () => {
    const repo = makeMockRepo()
    repo.setRaw('k', 'v')
    const adapter = createZustandStorage(repo)
    adapter.removeItem('k')
    expect(repo._raw.has('k')).toBe(false)
  })

  it('getItem 不存在的 key 返回 null', () => {
    const repo = makeMockRepo()
    const adapter = createZustandStorage(repo)
    expect(adapter.getItem('missing')).toBeNull()
  })
})
