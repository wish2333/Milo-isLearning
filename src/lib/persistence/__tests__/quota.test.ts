// quota.test.ts — 容量预警与历史 Module 淘汰单测
//
// 覆盖：
//   - getStorageUsage: 空存储/有数据字节计算
//   - isStorageNearLimit / isStorageFull: 阈值判断
//   - listModuleIds: Module 枚举
//   - removeModule: 关联数据清除
//   - evictOldestModule: 按 updatedAt 排序淘汰
//   - ensureCapacity: 兼容旧调用但不静默淘汰

import { beforeEach, describe, expect, it } from 'vitest'

import type { Module, ProgressState } from '@/types/domain'

import { StorageKeys } from '../keys'
import type { StorageRepository } from '../repository'
import {
  MAX_STORED_MODULES,
  ensureCapacity,
  evictOldestModule,
  getStorageCapacitySummary,
  getStorageUsage,
  isStorageFull,
  isStorageNearLimit,
  listModuleIds,
  removeModule,
} from '../quota'

// =================================================================
// In-memory mock repository
// =================================================================

class MockRepo implements StorageRepository {
  private store = new Map<string, string>()

  get<T>(key: string): T | null {
    const raw = this.store.get(key)
    if (raw === undefined) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, JSON.stringify(value))
  }

  remove(key: string): void {
    this.store.delete(key)
  }

  has(key: string): boolean {
    return this.store.has(key)
  }

  keys(): string[] {
    return [...this.store.keys()].filter((k) => k.startsWith('alc:'))
  }

  getRaw(key: string): string | null {
    return this.store.get(key) ?? null
  }

  clearAll(): void {
    this.store.clear()
  }
}

// =================================================================
// 测试夹具
// =================================================================

function makeModule(id: string): Module {
  return {
    id,
    sourceId: `source-${id}`,
    title: `Module ${id}`,
    intro: 'intro',
    goal: 'goal',
    concepts: [],
    feynmanTask: {
      moduleId: id,
      steps: [],
      finalPrompt: 'prompt',
      rubric: [],
    },
    order: 1,
  }
}

function makeProgress(moduleId: string, updatedAt: number): ProgressState {
  return {
    moduleId,
    stage: { kind: 'module_intro' },
    updatedAt,
  }
}

function seedModule(repo: StorageRepository, moduleId: string, updatedAt: number): void {
  const storedModule = makeModule(moduleId)
  repo.set(StorageKeys.module(moduleId), storedModule)
  repo.set(StorageKeys.progress(moduleId), makeProgress(moduleId, updatedAt))
  repo.set(StorageKeys.source(storedModule.sourceId), {
    id: storedModule.sourceId,
    type: 'markdown',
    content: 'x',
    createdAt: updatedAt,
  })
}

// =================================================================
// 测试
// =================================================================

describe('getStorageUsage', () => {
  let repo: MockRepo

  beforeEach(() => {
    repo = new MockRepo()
  })

  it('returns 0 for empty storage', () => {
    expect(getStorageUsage(repo)).toBe(0)
  })

  it('counts bytes of keys and values', () => {
    repo.set(StorageKeys.module('m1'), makeModule('m1'))
    const usage = getStorageUsage(repo)
    expect(usage).toBeGreaterThan(0)
  })

  it('only counts alc: prefixed keys', () => {
    // 模拟一个非 alc key
    ;(repo as unknown as { store: Map<string, string> }).store.set('foreign:key', '{"x":1}')
    repo.set(StorageKeys.module('m1'), makeModule('m1'))
    const usage = getStorageUsage(repo)
    // 应该只算 alc:module:m1 的字节
    const expectedKey = StorageKeys.module('m1')
    const expectedValue = JSON.stringify(makeModule('m1'))
    expect(usage).toBe(new Blob([expectedKey]).size + new Blob([expectedValue]).size)
  })
})

describe('isStorageNearLimit / isStorageFull', () => {
  it('returns false when usage is low', () => {
    const repo = new MockRepo()
    repo.set(StorageKeys.module('m1'), makeModule('m1'))
    expect(isStorageNearLimit(repo)).toBe(false)
    expect(isStorageFull(repo)).toBe(false)
  })
})

describe('listModuleIds', () => {
  it('returns empty array for no modules', () => {
    const repo = new MockRepo()
    expect(listModuleIds(repo)).toEqual([])
  })

  it('lists all stored module IDs', () => {
    const repo = new MockRepo()
    seedModule(repo, 'm1', 1000)
    seedModule(repo, 'm2', 2000)
    const ids = listModuleIds(repo).sort()
    expect(ids).toEqual(['m1', 'm2'])
  })
})

describe('removeModule', () => {
  it('removes module and all associated data', () => {
    const repo = new MockRepo()
    seedModule(repo, 'm1', 1000)
    const storedModule = repo.get<Module>(StorageKeys.module('m1'))!

    const removed = removeModule(repo, 'm1')

    expect(removed).toBe('m1')
    expect(repo.has(StorageKeys.module('m1'))).toBe(false)
    expect(repo.has(StorageKeys.source(storedModule.sourceId))).toBe(false)
    expect(repo.has(StorageKeys.mastery('m1'))).toBe(false)
    expect(repo.has(StorageKeys.feynman('m1'))).toBe(false)
    expect(repo.has(StorageKeys.progress('m1'))).toBe(false)
  })

  it('returns null for non-existent module', () => {
    const repo = new MockRepo()
    expect(removeModule(repo, 'nonexistent')).toBe(null)
  })

  it('removes source by module.sourceId instead of moduleId', () => {
    const repo = new MockRepo()
    seedModule(repo, 'm1', 1000)
    const storedModule = repo.get<Module>(StorageKeys.module('m1'))!

    removeModule(repo, 'm1')

    expect(repo.has(StorageKeys.source(storedModule.sourceId))).toBe(false)
  })

  it('removes module-scoped attempts archive', () => {
    const repo = new MockRepo()
    seedModule(repo, 'm1', 1000)
    repo.set(StorageKeys.attemptsModule('m1'), { attemptsBySlot: { q1: [] } })

    removeModule(repo, 'm1')

    expect(repo.has(StorageKeys.attemptsModule('m1'))).toBe(false)
  })

  it('removes prefixed slots from the global attempts store', () => {
    const repo = new MockRepo()
    seedModule(repo, 'm1', 1000)
    repo.set('alc:state:attempts', {
      state: {
        attemptsBySlot: {
          'm1:concept-1:slot-1': [{ id: 'a1' }],
          'm1:challenge-1': [{ id: 'a2' }],
          'm2:concept-1:slot-1': [{ id: 'b1' }],
          'concept-1:slot-1': [{ id: 'legacy' }],
        },
      },
      version: 0,
    })

    removeModule(repo, 'm1')

    expect(repo.get('alc:state:attempts')).toEqual({
      state: {
        attemptsBySlot: {
          'm2:concept-1:slot-1': [{ id: 'b1' }],
          'concept-1:slot-1': [{ id: 'legacy' }],
        },
      },
      version: 0,
    })
  })
})

describe('evictOldestModule', () => {
  it('returns null when no modules exist', () => {
    const repo = new MockRepo()
    expect(evictOldestModule(repo)).toBe(null)
  })

  it('evicts the module with oldest updatedAt', () => {
    const repo = new MockRepo()
    seedModule(repo, 'm1', 1000) // oldest
    seedModule(repo, 'm2', 3000)
    seedModule(repo, 'm3', 2000)

    const evicted = evictOldestModule(repo)

    expect(evicted).toBe('m1')
    expect(listModuleIds(repo).sort()).toEqual(['m2', 'm3'])
  })

  it('evicts module with no progress as oldest (updatedAt=0)', () => {
    const repo = new MockRepo()
    repo.set(StorageKeys.module('m1'), makeModule('m1')) // no progress → updatedAt=0
    seedModule(repo, 'm2', 1000)

    const evicted = evictOldestModule(repo)

    expect(evicted).toBe('m1')
  })
})

describe('ensureCapacity', () => {
  it('does not evict when under MAX_STORED_MODULES', () => {
    const repo = new MockRepo()
    seedModule(repo, 'm1', 1000)

    const evicted = ensureCapacity(repo, 0)

    expect(evicted).toEqual([])
    expect(listModuleIds(repo)).toEqual(['m1'])
  })

  it('does not evict normal libraries below the 12 module limit', () => {
    const repo = new MockRepo()
    for (let i = 1; i <= MAX_STORED_MODULES; i++) {
      seedModule(repo, `m${i}`, i * 1000)
    }

    const evicted = ensureCapacity(repo, 0)

    expect(evicted).toEqual([])
    expect(listModuleIds(repo)).toHaveLength(MAX_STORED_MODULES)
  })

  it('does not silently evict when exceeding the 12 module limit', () => {
    const repo = new MockRepo()
    for (let i = 1; i <= MAX_STORED_MODULES + 2; i++) {
      seedModule(repo, `m${i}`, i * 1000)
    }

    const evicted = ensureCapacity(repo, 0)

    expect(evicted).toEqual([])
    expect(listModuleIds(repo)).toHaveLength(MAX_STORED_MODULES + 2)
  })
})

describe('getStorageCapacitySummary', () => {
  it('reports module count, max modules, and near-limit state', () => {
    const repo = new MockRepo()
    for (let i = 1; i <= MAX_STORED_MODULES - 1; i++) {
      seedModule(repo, `m${i}`, i * 1000)
    }

    expect(getStorageCapacitySummary(repo)).toMatchObject({
      moduleCount: MAX_STORED_MODULES - 1,
      maxModules: MAX_STORED_MODULES,
      nearLimit: true,
    })
  })
})
