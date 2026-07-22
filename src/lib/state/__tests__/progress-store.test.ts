import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProgressStore } from '../progress-store'
import type { FeynmanAttempt, Module, ProgressState, ModuleStage, Quiz } from '@/types/domain'

const mockModuleState = vi.hoisted(() => ({ currentModule: null as Module | null }))
const mockStorage = vi.hoisted(() => ({
  get: vi.fn<(key: string) => ProgressState | null>(),
  set: vi.fn<(key: string, value: ProgressState) => void>(),
}))
const adaptiveMocks = vi.hoisted(() => ({
  collectReviewSlots: vi.fn().mockReturnValue([]),
  collectCarriedReviewSlots: vi.fn().mockReturnValue([]),
  collectConfirmSlots: vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/persistence/client/storage', () => ({
  getStorage: () => mockStorage,
}))

const mockStorageGet = mockStorage.get
const mockStorageSet = mockStorage.set

vi.mock('@/lib/persistence/client/zustand-storage-adapter', () => ({
  createZustandStorage: () => localStorage,
}))

vi.mock('@/lib/runtime/app-mode', () => ({
  isShowcaseMode: true,
}))

vi.mock('@/lib/persistence/client/auto-backup-trigger', () => ({
  triggerAutoBackup: vi.fn(),
}))

vi.mock('@/lib/runtime/adaptive-sequencer', () => ({
  ...adaptiveMocks,
}))

vi.mock('../attempts-store', () => ({
  useAttemptsStore: { getState: () => ({ attemptsBySlot: {} }) },
}))

vi.mock('../module-store', () => ({
  useModuleStore: { getState: () => mockModuleState },
}))

vi.mock('../settings-store', () => ({
  useSettingsStore: { getState: () => ({ confirmReviewEnabled: true }) },
}))

const MODULE_ID = 'module-test-123'

function makeQuiz(id: string, conceptId: string): Quiz {
  return {
    id,
    conceptId,
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: id,
    options: ['A', 'B'],
    answer: 'A',
    explanation: 'A is correct',
    distractors: ['B'],
  }
}

function makeModule(): Module {
  return {
    id: MODULE_ID,
    sourceId: 'source-test',
    title: 'Test module',
    intro: 'intro',
    goal: 'goal',
    order: 1,
    concepts: [0, 1].map((index) => {
      const conceptId = `concept-${index}`
      return {
        id: conceptId,
        moduleId: MODULE_ID,
        name: conceptId,
        definition: 'definition',
        type: 'fact' as const,
        keyPoints: ['point'],
        quizSeries: {
          conceptId,
          quizzes: [makeQuiz(`${conceptId}:slot-0`, conceptId)],
        },
        order: index + 1,
      }
    }),
    feynmanTask: {
      moduleId: MODULE_ID,
      steps: [],
      finalPrompt: 'prompt',
      rubric: [],
    },
  }
}

const feynmanAttempt: FeynmanAttempt = {
  moduleId: MODULE_ID,
  stepResults: [{ stepOrder: 1, score: 80 }],
  submittedAt: 999,
}

function makeSnapshot(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    moduleId: MODULE_ID,
    stage: { kind: 'concept', conceptIndex: 1, quizIndex: 2 },
    updatedAt: 1000,
    ...overrides,
  }
}

describe('progress-store resumeModule', () => {
  beforeEach(() => {
    mockModuleState.currentModule = null
    useProgressStore.setState({
      moduleId: null,
      stage: null,
      updatedAt: 0,
      feynmanAttempt: null,
    })
    vi.clearAllMocks()
    mockStorageGet.mockReturnValue(null)
  })

  it('skips invalid review slots instead of entering an empty quiz state', () => {
    mockModuleState.currentModule = makeModule()
    useProgressStore.setState({
      moduleId: MODULE_ID,
      stage: {
        kind: 'concept',
        conceptIndex: 0,
        quizIndex: 1,
        reviewSlots: ['deleted-quiz', 'concept-0:slot-0'],
      },
      updatedAt: 100,
      feynmanAttempt: null,
    })

    useProgressStore.getState().advance()

    expect(useProgressStore.getState().stage).toEqual({
      kind: 'concept',
      conceptIndex: 0,
      quizIndex: 1,
      reviewSlots: ['concept-0:slot-0'],
    })
  })

  it('leaves the review slot originalQuizId stable and then advances to the next concept', () => {
    mockModuleState.currentModule = makeModule()
    useProgressStore.setState({
      moduleId: MODULE_ID,
      stage: {
        kind: 'concept',
        conceptIndex: 0,
        quizIndex: 1,
        reviewSlots: ['concept-0:slot-0'],
      },
      updatedAt: 100,
      feynmanAttempt: null,
    })

    useProgressStore.getState().advance()

    expect(useProgressStore.getState().stage).toEqual({
      kind: 'concept',
      conceptIndex: 1,
      quizIndex: 0,
    })
  })

  it('skips an invalid review slot at the queue tail without entering a loading deadlock', () => {
    mockModuleState.currentModule = makeModule()
    useProgressStore.setState({
      moduleId: MODULE_ID,
      stage: {
        kind: 'concept',
        conceptIndex: 0,
        quizIndex: 1,
        reviewSlots: ['concept-0:slot-0', 'deleted-quiz'],
      },
      updatedAt: 100,
      feynmanAttempt: null,
    })

    useProgressStore.getState().advance()

    expect(useProgressStore.getState().stage).toEqual({
      kind: 'concept',
      conceptIndex: 1,
      quizIndex: 0,
    })
  })

  it('normalizes stale review slots and cursor when resuming a module', () => {
    mockModuleState.currentModule = makeModule()
    mockStorageGet.mockReturnValue(
      makeSnapshot({
        stage: {
          kind: 'concept',
          conceptIndex: 0,
          quizIndex: 2,
          reviewSlots: ['deleted-quiz', 'concept-0:slot-0'],
        },
      }),
    )

    useProgressStore.getState().resumeModule(MODULE_ID)

    expect(useProgressStore.getState().stage).toEqual({
      kind: 'concept',
      conceptIndex: 0,
      quizIndex: 1,
      reviewSlots: ['concept-0:slot-0'],
    })
  })

  it('moves a cursor stranded on a deleted tail review slot to the queue end', () => {
    mockModuleState.currentModule = makeModule()
    mockStorageGet.mockReturnValue(
      makeSnapshot({
        stage: {
          kind: 'concept',
          conceptIndex: 0,
          quizIndex: 2,
          reviewSlots: ['concept-0:slot-0', 'deleted-quiz'],
        },
      }),
    )

    useProgressStore.getState().resumeModule(MODULE_ID)

    expect(useProgressStore.getState().stage).toEqual({
      kind: 'concept',
      conceptIndex: 0,
      quizIndex: 2,
      reviewSlots: ['concept-0:slot-0'],
    })

    useProgressStore.getState().advance()

    expect(useProgressStore.getState().stage).toEqual({
      kind: 'concept',
      conceptIndex: 1,
      quizIndex: 0,
    })
  })

  it('resets progress when switching to a different module instead of reusing the old stage', () => {
    useProgressStore.getState().startModule('module-a')
    useProgressStore.getState().setStage({ kind: 'concept', conceptIndex: 2, quizIndex: 9 })

    useProgressStore.getState().startModule('module-b')

    expect(useProgressStore.getState()).toMatchObject({
      moduleId: 'module-b',
      stage: { kind: 'module_intro' },
      feynmanAttempt: null,
    })
  })

  it('falls back to module_intro when no snapshot and no global match', () => {
    useProgressStore.getState().resumeModule(MODULE_ID)

    const state = useProgressStore.getState()
    expect(state.moduleId).toBe(MODULE_ID)
    expect(state.stage?.kind).toBe('module_intro')
  })

  it('restores snapshot stage when snapshot exists and is not done', () => {
    const stage: ModuleStage = { kind: 'concept', conceptIndex: 1, quizIndex: 2 }
    mockStorageGet.mockReturnValue(makeSnapshot({ stage, updatedAt: 1000 }))

    useProgressStore.getState().resumeModule(MODULE_ID)

    const state = useProgressStore.getState()
    expect(state.moduleId).toBe(MODULE_ID)
    expect(state.stage).toEqual(stage)
    expect(state.updatedAt).toBe(1000)
  })

  it('restores feynmanAttempt from a per-module snapshot', () => {
    mockStorageGet.mockReturnValue(
      makeSnapshot({
        stage: { kind: 'feynman_step', stepOrder: 2 },
        feynmanAttempt,
      }),
    )

    useProgressStore.getState().resumeModule(MODULE_ID)

    expect(useProgressStore.getState().feynmanAttempt).toEqual(feynmanAttempt)
  })

  it('falls back to module_intro when snapshot stage is done', () => {
    mockStorageGet.mockReturnValue(makeSnapshot({ stage: { kind: 'done' }, updatedAt: 1000 }))

    useProgressStore.getState().resumeModule(MODULE_ID)

    const state = useProgressStore.getState()
    expect(state.moduleId).toBe(MODULE_ID)
    expect(state.stage?.kind).toBe('module_intro')
  })

  it('prefers global blob when its updatedAt is newer', () => {
    const globalStage: ModuleStage = { kind: 'feynman_intro' }
    useProgressStore.setState({
      moduleId: MODULE_ID,
      stage: globalStage,
      updatedAt: 2000,
      feynmanAttempt,
    })
    mockStorageGet.mockReturnValue(
      makeSnapshot({
        stage: { kind: 'concept', conceptIndex: 0, quizIndex: 0 },
        updatedAt: 1000,
      }),
    )

    useProgressStore.getState().resumeModule(MODULE_ID)

    const state = useProgressStore.getState()
    expect(state.stage).toEqual(globalStage)
    expect(state.updatedAt).toBe(2000)
    expect(state.feynmanAttempt).toEqual(feynmanAttempt)
  })

  it('uses snapshot when global moduleId does not match', () => {
    useProgressStore.setState({
      moduleId: 'other-module',
      stage: { kind: 'concept', conceptIndex: 5, quizIndex: 10 },
      updatedAt: 5000,
      feynmanAttempt: null,
    })
    const snapshotStage: ModuleStage = {
      kind: 'concept',
      conceptIndex: 1,
      quizIndex: 2,
    }
    mockStorageGet.mockReturnValue(makeSnapshot({ stage: snapshotStage, updatedAt: 1000 }))

    useProgressStore.getState().resumeModule(MODULE_ID)

    const state = useProgressStore.getState()
    expect(state.stage).toEqual(snapshotStage)
  })

  it('is idempotent when called twice with same moduleId', () => {
    const stage: ModuleStage = { kind: 'concept', conceptIndex: 1, quizIndex: 2 }
    mockStorageGet.mockReturnValue(makeSnapshot({ stage, updatedAt: 1000 }))

    useProgressStore.getState().resumeModule(MODULE_ID)
    const first = useProgressStore.getState()

    useProgressStore.getState().resumeModule(MODULE_ID)
    const second = useProgressStore.getState()

    expect(second.moduleId).toBe(first.moduleId)
    expect(second.stage).toEqual(first.stage)
    expect(second.updatedAt).toBe(first.updatedAt)
  })

  it('falls back to null for an old snapshot without feynmanAttempt', () => {
    mockStorageGet.mockReturnValue(
      makeSnapshot({
        stage: { kind: 'feynman_step', stepOrder: 2 },
        updatedAt: 1000,
      }),
    )
    useProgressStore.setState({
      moduleId: MODULE_ID,
      stage: { kind: 'feynman_step', stepOrder: 1 },
      updatedAt: 500,
      feynmanAttempt,
    })

    useProgressStore.getState().resumeModule(MODULE_ID)

    expect(useProgressStore.getState().feynmanAttempt).toBeNull()
  })

  it('persists feynmanAttempt in the per-module snapshot', () => {
    useProgressStore.getState().startModule(MODULE_ID)
    mockStorageSet.mockClear()

    useProgressStore.getState().startFeynman()

    expect(mockStorageSet).toHaveBeenLastCalledWith(
      `alc:progress:${MODULE_ID}`,
      expect.objectContaining({
        feynmanAttempt: {
          moduleId: MODULE_ID,
          stepResults: [],
          submittedAt: 0,
        },
      }),
    )
  })

  it('stores the submitted answer for Feynman history and updates it on correction', () => {
    useProgressStore.getState().startModule(MODULE_ID)
    useProgressStore.getState().startFeynman()

    useProgressStore.getState().recordFeynmanStep(1, 0, '我的原答案')
    expect(useProgressStore.getState().feynmanAttempt?.stepResults).toEqual([
      { stepOrder: 1, score: 0, userAnswer: '我的原答案' },
    ])

    useProgressStore.getState().recordFeynmanStep(1, 100, '我的原答案')
    expect(useProgressStore.getState().feynmanAttempt?.stepResults).toEqual([
      { stepOrder: 1, score: 100, userAnswer: '我的原答案' },
    ])
  })

  it('clears feynmanAttempt on startModule and reset', () => {
    useProgressStore.setState({
      moduleId: MODULE_ID,
      stage: { kind: 'feynman_step', stepOrder: 1 },
      updatedAt: 1000,
      feynmanAttempt,
    })

    useProgressStore.getState().startModule(MODULE_ID)
    expect(useProgressStore.getState().feynmanAttempt).toBeNull()

    useProgressStore.setState({ feynmanAttempt })
    useProgressStore.getState().reset()

    expect(useProgressStore.getState().feynmanAttempt).toBeNull()
  })

  it('resumeModule switches the per-module write target so advancing stage no longer pollutes the previous module (V2.1.5 regression)', () => {
    const OTHER_MODULE_ID = 'module-other-456'
    useProgressStore.setState({
      moduleId: MODULE_ID,
      stage: { kind: 'concept', conceptIndex: 0, quizIndex: 0 },
      updatedAt: 100,
      feynmanAttempt: null,
    })
    vi.clearAllMocks()
    mockStorageGet.mockReturnValue(null)

    useProgressStore.getState().resumeModule(OTHER_MODULE_ID)
    expect(useProgressStore.getState().moduleId).toBe(OTHER_MODULE_ID)

    mockStorageSet.mockClear()
    useProgressStore.setState({
      stage: { kind: 'concept', conceptIndex: 0, quizIndex: 1 },
      updatedAt: 200,
    })

    const writeCalls = mockStorageSet.mock.calls
    expect(writeCalls.length).toBeGreaterThan(0)
    for (const [key, value] of writeCalls) {
      expect(key).toBe(`alc:progress:${OTHER_MODULE_ID}`)
      expect((value as ProgressState).moduleId).toBe(OTHER_MODULE_ID)
    }
    expect(mockStorageSet).not.toHaveBeenCalledWith(`alc:progress:${MODULE_ID}`, expect.anything())
  })
})
