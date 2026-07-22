import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class MemoryRepository {
    private readonly values = new Map<string, unknown>()

    get<T>(key: string): T | null {
      return (this.values.get(key) as T | undefined) ?? null
    }

    set<T>(key: string, value: T): void {
      this.values.set(key, value)
    }

    remove(key: string): void {
      this.values.delete(key)
    }

    has(key: string): boolean {
      return this.values.has(key)
    }

    keys(): string[] {
      return [...this.values.keys()]
    }

    getRaw(key: string): string | null {
      const value = this.values.get(key)
      return value === undefined ? null : JSON.stringify(value)
    }

    setRaw(key: string, value: string): void {
      this.values.set(key, JSON.parse(value))
    }

    clearAll(): void {
      this.values.clear()
    }
  }

  return {
    production: new MemoryRepository(),
    legacy: new MemoryRepository(),
  }
})

vi.mock('@/lib/runtime/app-mode', () => ({ isShowcaseMode: false }))
vi.mock('@/lib/persistence/client/local-storage', () => ({
  LocalStorageRepository: class {},
  storage: mocks.legacy,
}))
vi.mock('@/lib/persistence/client/client-fetch-storage', () => ({
  ClientFetchStorageRepository: class {
    constructor() {
      return mocks.production
    }
  },
}))

const { getStorageKeysWithLegacyFallback, getStorageValueWithLegacyFallback } =
  await import('../storage')

describe('getStorageValueWithLegacyFallback', () => {
  beforeEach(() => {
    mocks.production.clearAll()
    mocks.legacy.clearAll()
  })

  it('production 缺失时从 legacy LocalStorage 读取并回填 production', () => {
    mocks.legacy.set('alc:module:m1', { id: 'm1', title: '旧题库' })

    expect(
      getStorageValueWithLegacyFallback<{ id: string; title: string }>('alc:module:m1'),
    ).toEqual({ id: 'm1', title: '旧题库' })
    expect(mocks.production.get('alc:module:m1')).toEqual({ id: 'm1', title: '旧题库' })
  })

  it('production 已有值时不被 legacy 覆盖', () => {
    mocks.production.set('alc:module:m1', { id: 'm1', title: 'server 题库' })
    mocks.legacy.set('alc:module:m1', { id: 'm1', title: '旧题库' })

    expect(getStorageValueWithLegacyFallback<{ title: string }>('alc:module:m1')).toEqual({
      id: 'm1',
      title: 'server 题库',
    })
  })

  it('两边都不存在时返回 null', () => {
    expect(getStorageValueWithLegacyFallback('alc:module:missing')).toBeNull()
  })

  it('production 已有索引时可合并 legacy 中尚未迁移的记录', () => {
    type TopicIndexEntry = { id: string; stale?: boolean }

    mocks.production.set<TopicIndexEntry[]>('alc:topic-index', [{ id: 'server-topic' }])
    mocks.legacy.set('alc:topic-index', [
      { id: 'legacy-topic' },
      { id: 'server-topic', stale: true },
    ])

    expect(
      getStorageValueWithLegacyFallback<TopicIndexEntry[]>('alc:topic-index', (current, legacy) => {
        const merged = new Map(legacy.map((item) => [item.id, item]))
        for (const item of current) merged.set(item.id, item)
        return [...merged.values()]
      }),
    ).toEqual([{ id: 'legacy-topic' }, { id: 'server-topic' }])
    expect(mocks.production.get('alc:topic-index')).toEqual([
      { id: 'legacy-topic' },
      { id: 'server-topic' },
    ])
  })

  it('production 枚举 key 时包含尚未迁移的 legacy 题库', () => {
    mocks.production.set('alc:module:server-module', { id: 'server-module' })
    mocks.legacy.set('alc:module:legacy-module', { id: 'legacy-module' })

    expect(getStorageKeysWithLegacyFallback()).toEqual([
      'alc:module:server-module',
      'alc:module:legacy-module',
    ])
  })
})
