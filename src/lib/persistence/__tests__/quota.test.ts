// quota.test.ts — 容量预警与历史 Module 淘汰单测
//
// 覆盖：
//   - getStorageUsage: 空存储/有数据字节计算
//   - isStorageNearLimit / isStorageFull: 阈值判断
//   - listModuleIds: Module 枚举
//   - removeModule: 关联数据清除
//   - evictOldestModule: 按 updatedAt 排序淘汰
//   - ensureCapacity: 超 MAX_HISTORY_MODULES 淘汰 + 超预警淘汰

import { beforeEach, describe, expect, it } from 'vitest'

import type { Module, ProgressState } from '@/types/domain'

import { StorageKeys } from '../keys'
import type { StorageRepository } from '../repository'
import {
  ensureCapacity,
  evictOldestModule,
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
  repo.set(StorageKeys.module(moduleId), makeModule(moduleId))
  repo.set(StorageKeys.progress(moduleId), makeProgress(moduleId, updatedAt))
  repo.set(StorageKeys.source(moduleId), {
    id: `source-${moduleId}`,
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

    const removed = removeModule(repo, 'm1')

    expect(removed).toBe('m1')
    expect(repo.has(StorageKeys.module('m1'))).toBe(false)
    expect(repo.has(StorageKeys.source('m1'))).toBe(false)
    expect(repo.has(StorageKeys.mastery('m1'))).toBe(false)
    expect(repo.has(StorageKeys.feynman('m1'))).toBe(false)
    expect(repo.has(StorageKeys.progress('m1'))).toBe(false)
  })

  it('returns null for non-existent module', () => {
    const repo = new MockRepo()
    expect(removeModule(repo, 'nonexistent')).toBe(null)
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
  it('does not evict when under MAX_HISTORY_MODULES', () => {
    const repo = new MockRepo()
    seedModule(repo, 'm1', 1000)

    const evicted = ensureCapacity(repo, 0)

    expect(evicted).toEqual([])
    expect(listModuleIds(repo)).toEqual(['m1'])
  })

  it('evicts oldest when exceeding MAX_HISTORY_MODULES (3)', () => {
    const repo = new MockRepo()
    seedModule(repo, 'm1', 1000) // oldest
    seedModule(repo, 'm2', 2000)
    seedModule(repo, 'm3', 3000)
    seedModule(repo, 'm4', 4000) // this is the 4th → over limit

    const evicted = ensureCapacity(repo, 0)

    expect(evicted).toEqual(['m1'])
    expect(listModuleIds(repo).sort()).toEqual(['m2', 'm3', 'm4'])
  })

  it('evicts multiple when far over limit', () => {
    const repo = new MockRepo()
    seedModule(repo, 'm1', 1000)
    seedModule(repo, 'm2', 2000)
    seedModule(repo, 'm3', 3000)
    seedModule(repo, 'm4', 4000)
    seedModule(repo, 'm5', 5000)
    seedModule(repo, 'm6', 6000)

    const evicted = ensureCapacity(repo, 0)

    // 6 modules → evict to 3 → evict m1, m2, m3
    expect(evicted).toEqual(['m1', 'm2', 'm3'])
    expect(listModuleIds(repo).sort()).toEqual(['m4', 'm5', 'm6'])
  })
})
