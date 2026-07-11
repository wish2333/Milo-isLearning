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

// =================================================================
// Mock LocalStorage（in-memory Map）
// =================================================================

const store = new Map<string, string>()

vi.mock('../local-storage', () => ({
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
    expect(listTopics()).toEqual([])
  })
})

describe('createTopic', () => {
  it('creates topic with topic- prefixed ID and correct fields', () => {
    const before = Date.now()
    const topic = createTopic('测试主题', '描述')
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
    const topicA = createTopic('主题A', undefined, ['mod-1'])
    createTopic('主题B', undefined, ['mod-1'])

    // enforcement happens in storage — re-read topicA
    expect(getTopic(topicA.id)!.moduleIds).toEqual([])
    expect(getTopicByModuleId('mod-1')!.name).toBe('主题B')
  })

  it('trims name and description', () => {
    const topic = createTopic('  名称  ', '  描述  ')
    expect(topic.name).toBe('名称')
    expect(topic.description).toBe('描述')
  })
})

describe('getTopic', () => {
  it('returns topic by id', () => {
    const topic = createTopic('存在')
    expect(getTopic(topic.id)).toEqual(topic)
  })

  it('returns null for unknown id', () => {
    expect(getTopic('nonexistent')).toBeNull()
  })
})

describe('getTopicByModuleId', () => {
  it('finds owning topic', () => {
    createTopic('主题A', undefined, ['mod-1', 'mod-2'])
    createTopic('主题B')
    expect(getTopicByModuleId('mod-1')?.name).toBe('主题A')
    expect(getTopicByModuleId('mod-2')?.name).toBe('主题A')
    expect(getTopicByModuleId('mod-3')).toBeNull()
  })
})

describe('updateTopic', () => {
  it('updates name and description with updatedAt', () => {
    const topic = createTopic('旧名称', '旧描述')
    const before = Date.now()
    updateTopic(topic.id, { name: '新名称', description: '新描述' })

    const updated = getTopic(topic.id)!
    expect(updated.name).toBe('新名称')
    expect(updated.description).toBe('新描述')
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('only updates provided fields', () => {
    const topic = createTopic('名称', '描述')
    updateTopic(topic.id, { name: '仅改名' })

    const updated = getTopic(topic.id)!
    expect(updated.name).toBe('仅改名')
    expect(updated.description).toBe('描述')
  })

  it('no-ops for unknown id', () => {
    updateTopic('nonexistent', { name: 'X' })
    expect(listTopics()).toHaveLength(0)
  })
})

describe('deleteTopic', () => {
  it('removes topic without deleting modules', () => {
    const topic = createTopic('待删', undefined, ['mod-1'])
    deleteTopic(topic.id)
    expect(getTopic(topic.id)).toBeNull()
    expect(listTopics()).toHaveLength(0)
  })
})

describe('addModuleToTopic', () => {
  it('adds module and enforces exclusive membership', () => {
    const topicA = createTopic('A', undefined, ['mod-1'])
    const topicB = createTopic('B')
    addModuleToTopic(topicB.id, 'mod-1')

    expect(getTopic(topicA.id)!.moduleIds).toEqual([])
    expect(getTopic(topicB.id)!.moduleIds).toEqual(['mod-1'])
  })

  it('no-ops if module already in topic', () => {
    const topic = createTopic('A', undefined, ['mod-1'])
    addModuleToTopic(topic.id, 'mod-1')
    expect(getTopic(topic.id)!.moduleIds).toEqual(['mod-1'])
  })
})

describe('removeModuleFromTopic', () => {
  it('removes module from topic', () => {
    const topic = createTopic('A', undefined, ['mod-1', 'mod-2'])
    removeModuleFromTopic(topic.id, 'mod-1')
    expect(getTopic(topic.id)!.moduleIds).toEqual(['mod-2'])
  })

  it('no-ops for unknown topic', () => {
    removeModuleFromTopic('nonexistent', 'mod-1')
  })
})

describe('moveModuleInTopic', () => {
  it('moves module up', () => {
    const topic = createTopic('A', undefined, ['m1', 'm2', 'm3'])
    moveModuleInTopic(topic.id, 'm3', 'up')
    expect(getTopic(topic.id)!.moduleIds).toEqual(['m1', 'm3', 'm2'])
  })

  it('moves module down', () => {
    const topic = createTopic('A', undefined, ['m1', 'm2', 'm3'])
    moveModuleInTopic(topic.id, 'm1', 'down')
    expect(getTopic(topic.id)!.moduleIds).toEqual(['m2', 'm1', 'm3'])
  })

  it('no-op when moving up at index 0', () => {
    const topic = createTopic('A', undefined, ['m1', 'm2'])
    moveModuleInTopic(topic.id, 'm1', 'up')
    expect(getTopic(topic.id)!.moduleIds).toEqual(['m1', 'm2'])
  })

  it('no-op when moving down at last index', () => {
    const topic = createTopic('A', undefined, ['m1', 'm2'])
    moveModuleInTopic(topic.id, 'm2', 'down')
    expect(getTopic(topic.id)!.moduleIds).toEqual(['m1', 'm2'])
  })
})

describe('reorderModulesInTopic', () => {
  it('sets new order', () => {
    const topic = createTopic('A', undefined, ['m1', 'm2', 'm3'])
    reorderModulesInTopic(topic.id, ['m3', 'm1', 'm2'])
    expect(getTopic(topic.id)!.moduleIds).toEqual(['m3', 'm1', 'm2'])
  })
})

describe('cascadeDeleteModule', () => {
  it('removes moduleId from all topics', () => {
    createTopic('A', undefined, ['mod-1', 'mod-2'])
    createTopic('B', undefined, ['mod-1', 'mod-3'])

    cascadeDeleteModule('mod-1')

    expect(getTopicByModuleId('mod-1')).toBeNull()
    expect(getTopicByModuleId('mod-2')?.name).toBe('A')
    expect(getTopicByModuleId('mod-3')?.name).toBe('B')
  })
})
