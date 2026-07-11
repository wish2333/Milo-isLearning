import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Topic } from '@/types/domain'

import { useTopicSessionStore } from '../topic-session-store'

// =================================================================
// Mock LocalStorage（in-memory Map）
// =================================================================

const store = new Map<string, string>()

vi.mock('../../persistence/local-storage', () => ({
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

// Mock topic-library so getTopic returns controlled data
const mockTopics = new Map<string, Topic>()

vi.mock('../../persistence/topic-library', () => ({
  getTopic: (topicId: string) => mockTopics.get(topicId) ?? null,
}))

beforeEach(() => {
  store.clear()
  mockTopics.clear()
  // Reset store state
  useTopicSessionStore.setState({ session: null })
})

// =================================================================
// Tests
// =================================================================

describe('startSession', () => {
  it('initializes session with first module in_progress, returns true', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试主题',
      moduleIds: ['mod-1', 'mod-2', 'mod-3'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const result = useTopicSessionStore.getState().startSession('topic-1')
    expect(result).toBe(true)

    const { session } = useTopicSessionStore.getState()
    expect(session).not.toBeNull()
    expect(session!.topicId).toBe('topic-1')
    expect(session!.currentIndex).toBe(0)
    expect(session!.moduleIds).toEqual(['mod-1', 'mod-2', 'mod-3'])
    expect(session!.moduleStatus).toEqual({
      'mod-1': 'in_progress',
      'mod-2': 'pending',
      'mod-3': 'pending',
    })
  })

  it('returns false when topic does not exist', () => {
    const result = useTopicSessionStore.getState().startSession('nonexistent')
    expect(result).toBe(false)
    expect(useTopicSessionStore.getState().session).toBeNull()
  })

  it('returns false when topic has empty moduleIds', () => {
    mockTopics.set('topic-empty', {
      id: 'topic-empty',
      name: '空主题',
      moduleIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const result = useTopicSessionStore.getState().startSession('topic-empty')
    expect(result).toBe(false)
    expect(useTopicSessionStore.getState().session).toBeNull()
  })
})

describe('markCurrentModuleDone', () => {
  it('sets current module status to done', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')

    useTopicSessionStore.getState().markCurrentModuleDone()

    const { session } = useTopicSessionStore.getState()
    expect(session!.moduleStatus['mod-1']).toBe('done')
    expect(session!.moduleStatus['mod-2']).toBe('pending')
  })
})

describe('advanceToNextModule', () => {
  it('advances index and sets next to in_progress', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2', 'mod-3'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')
    useTopicSessionStore.getState().markCurrentModuleDone()

    const nextId = useTopicSessionStore.getState().advanceToNextModule()
    expect(nextId).toBe('mod-2')

    const { session } = useTopicSessionStore.getState()
    expect(session!.currentIndex).toBe(1)
    expect(session!.moduleStatus['mod-2']).toBe('in_progress')
    expect(session!.moduleStatus['mod-1']).toBe('done')
  })

  it('returns null when at end', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')
    useTopicSessionStore.getState().markCurrentModuleDone()

    const result = useTopicSessionStore.getState().advanceToNextModule()
    expect(result).toBeNull()
  })

  it('returns null when no session', () => {
    const result = useTopicSessionStore.getState().advanceToNextModule()
    expect(result).toBeNull()
  })
})

describe('getCurrentModuleId', () => {
  it('returns correct module ID', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')

    expect(useTopicSessionStore.getState().getCurrentModuleId()).toBe('mod-1')
  })

  it('returns null when no session', () => {
    expect(useTopicSessionStore.getState().getCurrentModuleId()).toBeNull()
  })
})

describe('exitSession', () => {
  it('sets session to null', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')

    useTopicSessionStore.getState().exitSession()
    expect(useTopicSessionStore.getState().session).toBeNull()
  })
})

describe('isActive', () => {
  it('returns false when no session', () => {
    expect(useTopicSessionStore.getState().isActive()).toBe(false)
  })

  it('returns true when session active', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')

    expect(useTopicSessionStore.getState().isActive()).toBe(true)
  })
})
