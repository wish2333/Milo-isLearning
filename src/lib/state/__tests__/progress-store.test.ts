import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useProgressStore } from '../progress-store'
import type { ProgressState, ModuleStage } from '@/types/domain'
import { storage } from '@/lib/persistence/client/local-storage'

vi.mock('@/lib/persistence/client/local-storage', () => ({
  storage: { get: vi.fn<(key: string) => ProgressState | null>(), set: vi.fn() },
}))

const mockStorageGet = vi.mocked(storage.get)

vi.mock('@/lib/persistence/client/storage', () => ({
  getStorage: () => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }),
}))

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
  collectReviewSlots: vi.fn().mockReturnValue([]),
  collectCarriedReviewSlots: vi.fn().mockReturnValue([]),
  collectConfirmSlots: vi.fn().mockReturnValue([]),
}))

vi.mock('./attempts-store', () => ({
  useAttemptsStore: { getState: () => ({ attemptsBySlot: {} }) },
}))

vi.mock('./module-store', () => ({
  useModuleStore: { getState: () => ({ currentModule: null }) },
}))

vi.mock('./settings-store', () => ({
  useSettingsStore: { getState: () => ({ confirmReviewEnabled: true }) },
}))

const MODULE_ID = 'module-test-123'

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
    useProgressStore.setState({
      moduleId: null,
      stage: null,
      updatedAt: 0,
      feynmanAttempt: null,
    })
    mockStorageGet.mockReturnValue(null)
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
      feynmanAttempt: null,
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

  it('clears feynmanAttempt even when snapshot has one', () => {
    mockStorageGet.mockReturnValue(
      makeSnapshot({
        stage: { kind: 'concept', conceptIndex: 1, quizIndex: 2 },
        updatedAt: 1000,
      }),
    )
    useProgressStore.setState({
      moduleId: null,
      stage: null,
      updatedAt: 0,
      feynmanAttempt: {
        moduleId: MODULE_ID,
        stepResults: [{ stepOrder: 1, score: 80 }],
        submittedAt: 999,
      },
    })

    useProgressStore.getState().resumeModule(MODULE_ID)

    const state = useProgressStore.getState()
    expect(state.feynmanAttempt).toBeNull()
  })
})
