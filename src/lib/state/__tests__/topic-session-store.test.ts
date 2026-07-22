import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProgressState, TopicProgress } from '@/types/domain'
import type { Topic } from '@/types/domain'

import { mergeModuleTopicStatus, useTopicSessionStore } from '../topic-session-store'
import { StorageKeys } from '@/lib/persistence/shared/keys'

// =================================================================
// Mock LocalStorage（in-memory Map）
// =================================================================

const store = new Map<string, string>()

vi.mock('../../persistence/client/local-storage', () => ({
  // client/storage.ts 用 LocalStorageRepository class 实例化（showcase 模式），
  // mock 需要提供构造函数，否则 vi.mock 报 "no export defined"。
  LocalStorageRepository: class {
    get<T>(key: string): T | null {
      const raw = store.get(key)
      if (raw === undefined) return null
      return JSON.parse(raw) as T
    }
    set<T>(key: string, value: T): void {
      store.set(key, JSON.stringify(value))
    }
    remove(key: string): void {
      store.delete(key)
    }
    has(key: string): boolean {
      return store.has(key)
    }
    keys(): string[] {
      return [...store.keys()]
    }
    getRaw(key: string): string | null {
      return store.get(key) ?? null
    }
    clearAll(): void {
      store.clear()
    }
    setRaw(key: string, value: string): void {
      store.set(key, value)
    }
  },
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
  getTopic: (_repo: unknown, topicId: string) => mockTopics.get(topicId) ?? null,
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

  it('reuses a valid in-memory session for the same topic', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试主题',
      moduleIds: ['mod-1', 'mod-2'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    useTopicSessionStore.getState().startSession('topic-1')
    const firstSession = useTopicSessionStore.getState().session
    const result = useTopicSessionStore.getState().startSession('topic-1')

    expect(result).toBe(true)
    expect(useTopicSessionStore.getState().session).toBe(firstSession)
  })

  it('restarts from the beginning after an all-done in-memory session', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试主题',
      moduleIds: ['mod-1'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    useTopicSessionStore.getState().startSession('topic-1')
    useTopicSessionStore.getState().markCurrentModuleDone()
    useTopicSessionStore.getState().startSession('topic-1')

    const { session } = useTopicSessionStore.getState()
    expect(session!.currentIndex).toBe(0)
    expect(session!.moduleStatus['mod-1']).toBe('in_progress')
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

describe('markModuleDone', () => {
  it('marks any in-topic module done regardless of currentIndex and persists snapshot', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2', 'mod-3'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')

    useTopicSessionStore.getState().markModuleDone('mod-2')

    const { session } = useTopicSessionStore.getState()
    expect(session!.moduleStatus['mod-2']).toBe('done')
    expect(session!.moduleStatus['mod-1']).toBe('in_progress')
    expect(session!.currentIndex).toBe(0)

    const snapshot = store.get(StorageKeys.topicProgress('topic-1'))
    const parsed = JSON.parse(snapshot!) as TopicProgress
    expect(parsed.completedModuleIds).toContain('mod-2')
  })

  it('ignores modules not in the topic and is a no-op without an active session', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')

    useTopicSessionStore.getState().markModuleDone('not-in-topic')
    expect(useTopicSessionStore.getState().session!.moduleStatus['not-in-topic']).toBeUndefined()

    useTopicSessionStore.getState().exitSession()
    useTopicSessionStore.getState().markModuleDone('mod-1')
    expect(useTopicSessionStore.getState().session).toBeNull()
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

// =================================================================
// F22 主题进度快照测试
// =================================================================

describe('F22 topic progress snapshot', () => {
  const progressKey = (topicId: string) => `alc:topic-progress:${topicId}`

  const readProgress = (topicId: string): TopicProgress => {
    const raw = store.get(progressKey(topicId))
    expect(raw).toBeDefined()
    return JSON.parse(raw!) as TopicProgress
  }

  const seedTopic = (moduleIds = ['mod-1', 'mod-2', 'mod-3']) => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  it('persists completion immediately and restores it without exitSession', () => {
    seedTopic()
    useTopicSessionStore.getState().startSession('topic-1')
    useTopicSessionStore.getState().markCurrentModuleDone()

    expect(readProgress('topic-1').completedModuleIds).toEqual(['mod-1'])

    useTopicSessionStore.setState({ session: null })
    useTopicSessionStore.getState().startSession('topic-1')
    expect(useTopicSessionStore.getState().session!.moduleStatus).toEqual({
      'mod-1': 'done',
      'mod-2': 'in_progress',
      'mod-3': 'pending',
    })
  })

  it('persists advanceToNextModule immediately', () => {
    seedTopic()
    useTopicSessionStore.getState().startSession('topic-1')
    useTopicSessionStore.getState().markCurrentModuleDone()
    useTopicSessionStore.getState().advanceToNextModule()

    expect(readProgress('topic-1').completedModuleIds).toEqual(['mod-1'])
  })

  it('persists skipCurrentModule immediately', () => {
    seedTopic()
    useTopicSessionStore.getState().startSession('topic-1')
    useTopicSessionStore.getState().skipCurrentModule()

    expect(readProgress('topic-1').skippedModuleIds).toEqual(['mod-1'])
  })

  it('persists reenterModule immediately and removes the skipped marker', () => {
    seedTopic()
    useTopicSessionStore.getState().startSession('topic-1')
    useTopicSessionStore.getState().skipCurrentModule()
    useTopicSessionStore.getState().reenterModule('mod-1')

    const progress = readProgress('topic-1')
    expect(progress.completedModuleIds).toEqual([])
    expect(progress.skippedModuleIds).toEqual([])
    expect(useTopicSessionStore.getState().session!.moduleStatus['mod-1']).toBe('in_progress')
  })

  it('exitSession writes snapshot with correct completedModuleIds', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2', 'mod-3'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')
    useTopicSessionStore.getState().markCurrentModuleDone()
    useTopicSessionStore.getState().advanceToNextModule()
    useTopicSessionStore.getState().markCurrentModuleDone()

    useTopicSessionStore.getState().exitSession()

    const raw = store.get(progressKey('topic-1'))
    expect(raw).not.toBeNull()
    const progress = JSON.parse(raw!) as TopicProgress
    expect(progress.topicId).toBe('topic-1')
    expect(progress.completedModuleIds).toEqual(['mod-1', 'mod-2'])
    expect(progress.lastVisitedAt).toBeGreaterThan(0)
  })

  it('exitSession writes empty completedModuleIds when no modules done', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')

    useTopicSessionStore.getState().exitSession()

    const raw = store.get(progressKey('topic-1'))
    expect(raw).not.toBeNull()
    const progress = JSON.parse(raw!) as TopicProgress
    expect(progress.completedModuleIds).toEqual([])
  })

  it('exitSession does not write snapshot when no session', () => {
    useTopicSessionStore.getState().exitSession()
    expect(store.get(progressKey('nonexistent'))).toBeUndefined()
  })

  it('startSession reads snapshot and marks modules as done', () => {
    // Pre-seed a progress snapshot
    const snapshot: TopicProgress = {
      topicId: 'topic-1',
      completedModuleIds: ['mod-1', 'mod-2'],
      lastVisitedAt: Date.now() - 10000,
    }
    store.set(progressKey('topic-1'), JSON.stringify(snapshot))

    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2', 'mod-3'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')

    const { session } = useTopicSessionStore.getState()
    expect(session).not.toBeNull()
    expect(session!.moduleStatus).toEqual({
      'mod-1': 'done',
      'mod-2': 'done',
      'mod-3': 'in_progress',
    })
    expect(session!.currentIndex).toBe(2)
  })

  it('startSession without prior progress keeps all modules pending', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')

    const { session } = useTopicSessionStore.getState()
    expect(session!.moduleStatus).toEqual({
      'mod-1': 'in_progress',
      'mod-2': 'pending',
    })
    expect(session!.currentIndex).toBe(0)
  })

  it('startSession resumes from first module when all previously done', () => {
    const snapshot: TopicProgress = {
      topicId: 'topic-1',
      completedModuleIds: ['mod-1', 'mod-2'],
      lastVisitedAt: Date.now(),
    }
    store.set(progressKey('topic-1'), JSON.stringify(snapshot))

    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useTopicSessionStore.getState().startSession('topic-1')

    const { session } = useTopicSessionStore.getState()
    // All modules were done, so fallback to index 0
    expect(session!.moduleStatus).toEqual({
      'mod-1': 'in_progress',
      'mod-2': 'done',
    })
    expect(session!.currentIndex).toBe(0)
  })

  it('round-trip: exitSession then startSession restores progress', () => {
    mockTopics.set('topic-1', {
      id: 'topic-1',
      name: '测试',
      moduleIds: ['mod-1', 'mod-2', 'mod-3'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    // Complete mod-1 and mod-2, then exit
    useTopicSessionStore.getState().startSession('topic-1')
    useTopicSessionStore.getState().markCurrentModuleDone()
    useTopicSessionStore.getState().advanceToNextModule()
    useTopicSessionStore.getState().markCurrentModuleDone()
    useTopicSessionStore.getState().exitSession()

    // Re-enter
    useTopicSessionStore.getState().startSession('topic-1')
    const { session } = useTopicSessionStore.getState()
    expect(session!.moduleStatus['mod-1']).toBe('done')
    expect(session!.moduleStatus['mod-2']).toBe('done')
    expect(session!.moduleStatus['mod-3']).toBe('in_progress')
    expect(session!.currentIndex).toBe(2)
  })
})

describe('mergeModuleTopicStatus', () => {
  const progress = (stage: ProgressState['stage']): ProgressState => ({
    moduleId: 'mod-1',
    stage,
    updatedAt: Date.now(),
  })

  it('promotes a pending session to done when per-module progress is done', () => {
    expect(mergeModuleTopicStatus('pending', progress({ kind: 'done' }))).toBe('done')
  })

  it('promotes pending to in_progress for non-initial module progress', () => {
    expect(
      mergeModuleTopicStatus('pending', progress({ kind: 'concept_intro', conceptIndex: 0 })),
    ).toBe('in_progress')
  })

  it('keeps initial module_intro progress pending', () => {
    expect(mergeModuleTopicStatus('pending', progress({ kind: 'module_intro' }))).toBe('pending')
  })

  it('does not override skipped session status', () => {
    expect(
      mergeModuleTopicStatus(
        'skipped',
        progress({ kind: 'concept', conceptIndex: 0, quizIndex: 0 }),
      ),
    ).toBe('skipped')
  })
})
