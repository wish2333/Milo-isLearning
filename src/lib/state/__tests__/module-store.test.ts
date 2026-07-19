// module-store.test.ts -- correctQuizAnswer action tests
//
// Mock getStorage() via vi.mock to isolate from real localStorage.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Module, Quiz } from '@/types/domain'

// Mock app-mode so skipHydration = true (no SSR hydration in tests)
vi.mock('@/lib/runtime/app-mode', () => ({
  isShowcaseMode: true,
}))

// --- Mock repo (in-memory, same pattern as module-library.test.ts) ---

class MockRepo {
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

  setRaw(key: string, value: string): void {
    this.store.set(key, value)
  }
}

const mockRepo = new MockRepo()

// Mock getStorage to return our MockRepo
vi.mock('@/lib/persistence/client/storage', () => ({
  getStorage: () => mockRepo,
}))

// Mock createZustandStorage to adapt repo to zustand's StateStorage shape
vi.mock('@/lib/persistence/client/zustand-storage-adapter', () => ({
  createZustandStorage: (repo: unknown) => {
    const r = repo as {
      getRaw: (k: string) => string | null
      setRaw: (k: string, v: string) => void
      remove: (k: string) => void
    }
    return {
      getItem: (key: string) => r.getRaw(key),
      setItem: (key: string, value: string) => r.setRaw(key, value),
      removeItem: (key: string) => r.remove(key),
    }
  },
}))

// Import after mocks are set up
const { useModuleStore } = await import('../module-store')
const { useAttemptsStore } = await import('../attempts-store')
const { loadStoredModule } = await import('@/lib/persistence/module-library')
const { scheduleLibrary } = await import('@/lib/persistence/schedule-library')

// --- Fixtures ---

function makeQuiz(id: string, conceptId: string): Quiz {
  return {
    id,
    conceptId,
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: 'quiz stem',
    options: ['a', 'b', 'c', 'd'],
    answer: 'a',
    explanation: 'exp',
    distractors: ['b', 'c', 'd'],
  }
}

function makeModule(overrides?: Partial<Module>): Module {
  const quiz1 = makeQuiz('module-1:concept-1:slot-1', 'concept-1')
  const quiz2 = makeQuiz('module-1:concept-2:slot-1', 'concept-2')
  const challengeQuiz = makeQuiz('module-1:challenge-1', '')
  return {
    id: 'module-1',
    sourceId: 'source-1',
    title: 'Test Module',
    intro: 'test',
    goal: 'test goal',
    order: 1,
    origin: 'user',
    concepts: [
      {
        id: 'concept-1',
        moduleId: 'module-1',
        name: 'Concept 1',
        definition: 'def',
        type: 'fact' as const,
        keyPoints: ['kp1'],
        quizSeries: { conceptId: 'concept-1', quizzes: [quiz1] },
        order: 1,
      },
      {
        id: 'concept-2',
        moduleId: 'module-1',
        name: 'Concept 2',
        definition: 'def',
        type: 'fact' as const,
        keyPoints: ['kp1'],
        quizSeries: { conceptId: 'concept-2', quizzes: [quiz2] },
        order: 2,
      },
    ],
    challengeQuizzes: [challengeQuiz],
    feynmanTask: {
      moduleId: 'module-1',
      steps: [],
      finalPrompt: 'prompt',
      rubric: ['rubric'],
    },
    ...overrides,
  }
}

describe('module-store correctQuizAnswer', () => {
  beforeEach(() => {
    mockRepo.clearAll()
    useModuleStore.getState().clear()
    useAttemptsStore.setState({ attemptsBySlot: {} })
  })

  it('correctQuizAnswer updates currentModule with patched answer', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)

    useModuleStore.getState().correctQuizAnswer('module-1:concept-1:slot-1', { answer: 'b' })

    const current = useModuleStore.getState().currentModule
    expect(current).not.toBeNull()
    const patchedQuiz = current!.concepts[0]!.quizSeries.quizzes[0]!
    expect(patchedQuiz.answer).toBe('b')
  })

  it('correctQuizAnswer syncs currentQuiz when quizId matches currentQuiz.id', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)
    const quiz = testModule.concepts[0]!.quizSeries.quizzes[0]!
    useModuleStore.getState().setCurrentQuiz(quiz)

    useModuleStore.getState().correctQuizAnswer('module-1:concept-1:slot-1', { answer: 'c' })

    const currentQuiz = useModuleStore.getState().currentQuiz
    expect(currentQuiz).not.toBeNull()
    expect(currentQuiz!.answer).toBe('c')
  })

  it('correctQuizAnswer does NOT change currentQuiz when quizId != currentQuiz.id', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)
    const quiz = testModule.concepts[0]!.quizSeries.quizzes[0]!
    useModuleStore.getState().setCurrentQuiz(quiz)

    useModuleStore.getState().correctQuizAnswer('module-1:concept-2:slot-1', { answer: 'c' })

    const currentQuiz = useModuleStore.getState().currentQuiz
    expect(currentQuiz!.answer).toBe('a') // unchanged
  })

  it('correctQuizAnswer is a no-op when currentModule is null', () => {
    // currentModule starts as null after clear
    expect(useModuleStore.getState().currentModule).toBeNull()

    // Should not throw
    useModuleStore.getState().correctQuizAnswer('nonexistent', { answer: 'b' })

    expect(useModuleStore.getState().currentModule).toBeNull()
  })

  it('patch { ignored: true } persists to currentModule', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)

    useModuleStore.getState().correctQuizAnswer('module-1:concept-1:slot-1', { ignored: true })

    const current = useModuleStore.getState().currentModule
    expect(current).not.toBeNull()
    const patchedQuiz = current!.concepts[0]!.quizSeries.quizzes[0]!
    expect(patchedQuiz.ignored).toBe(true)
  })

  it('update persists to storage (reload via loadStoredModule verifies)', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)

    useModuleStore.getState().correctQuizAnswer('module-1:concept-1:slot-1', { answer: 'd' })

    // Reload from mock storage to verify persistence
    const reloaded = loadStoredModule(mockRepo, 'module-1')
    expect(reloaded).not.toBeNull()
    const reloadedQuiz = reloaded!.concepts[0]!.quizSeries.quizzes[0]!
    expect(reloadedQuiz.answer).toBe('d')
  })

  it('ignoring a quiz removes only its schedule cache', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)
    scheduleLibrary.set('module-1:concept-1:slot-1', {
      slotId: 'module-1:concept-1:slot-1',
      moduleId: 'module-1',
      conceptId: 'concept-1',
      state: 'review',
      due: new Date(1_000).toISOString(),
      stability: 1,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      elapsed_days: 0,
      scheduled_days: 1,
      last_review: new Date(1_000).toISOString(),
      schemaVersion: 1,
      contentRevision: 'v1',
      configRevision: 'v1',
      lastAppliedAttemptId: 'attempt-1',
    })
    scheduleLibrary.set('module-1:concept-2:slot-1', {
      slotId: 'module-1:concept-2:slot-1',
      moduleId: 'module-1',
      conceptId: 'concept-2',
      state: 'review',
      due: new Date(1_000).toISOString(),
      stability: 1,
      difficulty: 5,
      reps: 1,
      lapses: 0,
      elapsed_days: 0,
      scheduled_days: 1,
      last_review: new Date(1_000).toISOString(),
      schemaVersion: 1,
      contentRevision: 'v1',
      configRevision: 'v1',
      lastAppliedAttemptId: 'attempt-2',
    })

    useModuleStore.getState().correctQuizAnswer('module-1:concept-1:slot-1', { ignored: true })

    expect(scheduleLibrary.get('module-1:concept-1:slot-1')).toBeNull()
    expect(scheduleLibrary.get('module-1:concept-2:slot-1')).not.toBeNull()
  })

  it('restoring a quiz rebuilds its schedule from attempts history', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)
    const slotId = 'module-1:concept-1:slot-1'
    useAttemptsStore.setState({
      attemptsBySlot: {
        [slotId]: [
          {
            id: 'attempt-1',
            quizId: slotId,
            originalQuizId: slotId,
            userAnswer: 'a',
            score: 100,
            gaps: [],
            nextAction: 'advance',
            timestamp: 1_000,
            attemptVersion: 0,
          },
        ],
      },
    })

    useModuleStore.getState().correctQuizAnswer(slotId, { ignored: false })

    expect(scheduleLibrary.get(slotId)).toMatchObject({
      slotId,
      moduleId: 'module-1',
      conceptId: 'concept-1',
      lastAppliedAttemptId: 'attempt-1',
    })
  })
})

describe('module-store updateKnowledgePage', () => {
  beforeEach(() => {
    mockRepo.clearAll()
    useModuleStore.getState().clear()
  })

  it('updates knowledgePage on the matching concept', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)

    useModuleStore.getState().updateKnowledgePage('concept-1', 'new knowledge content')

    const current = useModuleStore.getState().currentModule
    expect(current).not.toBeNull()
    expect(current!.concepts[0]!.knowledgePage).toBe('new knowledge content')
    expect(current!.concepts[1]!.knowledgePage).toBeUndefined()
  })

  it('is a no-op when conceptId does not exist', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)

    expect(() =>
      useModuleStore.getState().updateKnowledgePage('nonexistent', 'content'),
    ).not.toThrow()

    const current = useModuleStore.getState().currentModule
    expect(current!.concepts[0]!.knowledgePage).toBeUndefined()
  })

  it('is a no-op for showcase modules', () => {
    const testModule = makeModule({ origin: 'showcase' })
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)

    useModuleStore.getState().updateKnowledgePage('concept-1', 'new content')

    const current = useModuleStore.getState().currentModule
    expect(current!.concepts[0]!.knowledgePage).toBeUndefined()
  })

  it('is a no-op when currentModule is null', () => {
    expect(() =>
      useModuleStore.getState().updateKnowledgePage('concept-1', 'content'),
    ).not.toThrow()
    expect(useModuleStore.getState().currentModule).toBeNull()
  })

  it('returns a new object (immutable update)', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)
    const before = useModuleStore.getState().currentModule

    useModuleStore.getState().updateKnowledgePage('concept-1', 'new content')

    const after = useModuleStore.getState().currentModule
    expect(before).not.toBe(after)
    expect(before!.concepts[0]).not.toBe(after!.concepts[0])
  })

  it('persists updated knowledgePage to storage', () => {
    const testModule = makeModule()
    mockRepo.set('alc:module:module-1', testModule)
    useModuleStore.getState().setModule(testModule)

    useModuleStore.getState().updateKnowledgePage('concept-2', 'knowledge for concept 2')

    const reloaded = loadStoredModule(mockRepo, 'module-1')
    expect(reloaded).not.toBeNull()
    expect(reloaded!.concepts[1]!.knowledgePage).toBe('knowledge for concept 2')
  })
})
