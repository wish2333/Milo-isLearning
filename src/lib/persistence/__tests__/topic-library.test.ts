import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addModuleToTopic,
  cascadeDeleteModule,
  createTopic,
  deleteTopic,
  getTopic,
  getTopicByModuleId,
  listTopics,
  moveModuleInTopic,
  removeModuleFromTopic,
  reorderModulesInTopic,
  updateTopic,
} from '../topic-library'
import { storage } from '../client/local-storage'

// =================================================================
// Mock LocalStorage（in-memory Map�?
// =================================================================

const store = new Map<string, string>()

vi.mock('../client/local-storage', () => ({
  storage: {
    get<T>(key: string): T | null {
      const raw = store.get(key)
      if (raw === undefined) return null
      return JSON.parse(raw) as T
    },
    set<T>(key: string, value: T): void {
      store.set(key, JSON.stringify(value))
    },
    remove(key: string): void {
      store.delete(key)
    },
    has(key: string): boolean {
      return store.has(key)
    },
    keys(): string[] {
      return [...store.keys()]
    },
    getRaw(key: string): string | null {
      return store.get(key) ?? null
    },
    clearAll(): void {
      store.clear()
    },
    setRaw(key: string, value: string): void {
      store.set(key, value)
    },
  },
}))

beforeEach(() => {
  store.clear()
})

// =================================================================
// Tests
// =================================================================

describe('listTopics', () => {
  it('returns empty array when no data', () => {
    expect(listTopics(storage)).toEqual([])
  })
})

describe('createTopic', () => {
  it('creates topic with topic- prefixed ID and correct fields', () => {
    const before = Date.now()
    const topic = createTopic(storage, '测试主题', '描述')
    const after = Date.now()

    expect(topic.id).toMatch(/^topic-/)
    expect(topic.name).toBe('测试主题')
    expect(topic.description).toBe('描述')
    expect(topic.moduleIds).toEqual([])
    expect(topic.createdAt).toBeGreaterThanOrEqual(before)
    expect(topic.createdAt).toBeLessThanOrEqual(after)
    expect(topic.updatedAt).toBe(topic.createdAt)
  })

  it('enforces one-to-many membership when moduleIds provided', () => {
    const topicA = createTopic(storage, '主题A', undefined, ['mod-1'])
    createTopic(storage, '主题B', undefined, ['mod-1'])

    // enforcement happens in storage -- re-read topicA
    expect(getTopic(storage, topicA.id)!.moduleIds).toEqual([])
    expect(getTopicByModuleId(storage, 'mod-1')!.name).toBe('主题B')
  })

  it('trims name and description', () => {
    const topic = createTopic(storage, '  名称  ', '  描述  ')
    expect(topic.name).toBe('名称')
    expect(topic.description).toBe('描述')
  })
})

describe('getTopic', () => {
  it('returns topic by id', () => {
    const topic = createTopic(storage, '存在')
    expect(getTopic(storage, topic.id)).toEqual(topic)
  })

  it('returns null for unknown id', () => {
    expect(getTopic(storage, 'nonexistent')).toBeNull()
  })
})

describe('getTopicByModuleId', () => {
  it('finds owning topic', () => {
    createTopic(storage, '主题A', undefined, ['mod-1', 'mod-2'])
    createTopic(storage, '主题B')
    expect(getTopicByModuleId(storage, 'mod-1')?.name).toBe('主题A')
    expect(getTopicByModuleId(storage, 'mod-2')?.name).toBe('主题A')
    expect(getTopicByModuleId(storage, 'mod-3')).toBeNull()
  })
})

describe('updateTopic', () => {
  it('updates name and description with updatedAt', () => {
    const topic = createTopic(storage, '旧名称', '旧描述')
    const before = Date.now()
    updateTopic(storage, topic.id, { name: '新名称', description: '新描述' })

    const updated = getTopic(storage, topic.id)!
    expect(updated.name).toBe('新名称')
    expect(updated.description).toBe('新描述')
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('only updates provided fields', () => {
    const topic = createTopic(storage, '名称', '描述')
    updateTopic(storage, topic.id, { name: '仅改名' })

    const updated = getTopic(storage, topic.id)!
    expect(updated.name).toBe('仅改名')
    expect(updated.description).toBe('描述')
  })

  it('no-ops for unknown id', () => {
    updateTopic(storage, 'nonexistent', { name: 'X' })
    expect(listTopics(storage)).toHaveLength(0)
  })
})

describe('deleteTopic', () => {
  it('removes topic without deleting modules', () => {
    const topic = createTopic(storage, '待删', undefined, ['mod-1'])
    deleteTopic(storage, topic.id)
    expect(getTopic(storage, topic.id)).toBeNull()
    expect(listTopics(storage)).toHaveLength(0)
  })
})

describe('addModuleToTopic', () => {
  it('adds module and enforces exclusive membership', () => {
    const topicA = createTopic(storage, 'A', undefined, ['mod-1'])
    const topicB = createTopic(storage, 'B')
    addModuleToTopic(storage, topicB.id, 'mod-1')

    expect(getTopic(storage, topicA.id)!.moduleIds).toEqual([])
    expect(getTopic(storage, topicB.id)!.moduleIds).toEqual(['mod-1'])
  })

  it('no-ops if module already in topic', () => {
    const topic = createTopic(storage, 'A', undefined, ['mod-1'])
    addModuleToTopic(storage, topic.id, 'mod-1')
    expect(getTopic(storage, topic.id)!.moduleIds).toEqual(['mod-1'])
  })
})

describe('removeModuleFromTopic', () => {
  it('removes module from topic', () => {
    const topic = createTopic(storage, 'A', undefined, ['mod-1', 'mod-2'])
    removeModuleFromTopic(storage, topic.id, 'mod-1')
    expect(getTopic(storage, topic.id)!.moduleIds).toEqual(['mod-2'])
  })

  it('no-ops for unknown topic', () => {
    removeModuleFromTopic(storage, 'nonexistent', 'mod-1')
  })
})

describe('moveModuleInTopic', () => {
  it('moves module up', () => {
    const topic = createTopic(storage, 'A', undefined, ['m1', 'm2', 'm3'])
    moveModuleInTopic(storage, topic.id, 'm3', 'up')
    expect(getTopic(storage, topic.id)!.moduleIds).toEqual(['m1', 'm3', 'm2'])
  })

  it('moves module down', () => {
    const topic = createTopic(storage, 'A', undefined, ['m1', 'm2', 'm3'])
    moveModuleInTopic(storage, topic.id, 'm1', 'down')
    expect(getTopic(storage, topic.id)!.moduleIds).toEqual(['m2', 'm1', 'm3'])
  })

  it('no-op when moving up at index 0', () => {
    const topic = createTopic(storage, 'A', undefined, ['m1', 'm2'])
    moveModuleInTopic(storage, topic.id, 'm1', 'up')
    expect(getTopic(storage, topic.id)!.moduleIds).toEqual(['m1', 'm2'])
  })

  it('no-op when moving down at last index', () => {
    const topic = createTopic(storage, 'A', undefined, ['m1', 'm2'])
    moveModuleInTopic(storage, topic.id, 'm2', 'down')
    expect(getTopic(storage, topic.id)!.moduleIds).toEqual(['m1', 'm2'])
  })
})

describe('reorderModulesInTopic', () => {
  it('sets new order', () => {
    const topic = createTopic(storage, 'A', undefined, ['m1', 'm2', 'm3'])
    reorderModulesInTopic(storage, topic.id, ['m3', 'm1', 'm2'])
    expect(getTopic(storage, topic.id)!.moduleIds).toEqual(['m3', 'm1', 'm2'])
  })
})

describe('cascadeDeleteModule', () => {
  it('removes moduleId from all topics', () => {
    createTopic(storage, 'A', undefined, ['mod-1', 'mod-2'])
    createTopic(storage, 'B', undefined, ['mod-1', 'mod-3'])

    cascadeDeleteModule(storage, 'mod-1')

    expect(getTopicByModuleId(storage, 'mod-1')).toBeNull()
    expect(getTopicByModuleId(storage, 'mod-2')?.name).toBe('A')
    expect(getTopicByModuleId(storage, 'mod-3')?.name).toBe('B')
  })
})
