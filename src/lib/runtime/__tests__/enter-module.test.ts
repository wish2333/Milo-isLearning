import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enterModule } from '../enter-module'
import { storage } from '@/lib/persistence/client/local-storage'
import type { Module } from '@/types/domain'

vi.mock('@/lib/persistence/client/local-storage', () => ({
  storage: { get: vi.fn(), set: vi.fn() },
}))

const mockStorageGet = vi.mocked(storage.get)

// Stable mock fn references — shared across all calls to getState()
const mockSetModule = vi.fn()
const mockResumeModule = vi.fn()
const mockStartModule = vi.fn()

vi.mock('@/lib/state/module-store', () => ({
  useModuleStore: {
    getState: () => ({
      setModule: mockSetModule,
      currentModule: null,
      currentQuiz: null,
    }),
  },
}))

vi.mock('@/lib/state/progress-store', () => ({
  useProgressStore: {
    getState: () => ({
      resumeModule: mockResumeModule,
      startModule: mockStartModule,
    }),
  },
}))

const mockModule: Module = {
  id: 'test-module-1',
  sourceId: 'source-1',
  title: 'Test Module',
  intro: 'Test intro',
  goal: 'Test goal',
  concepts: [],
  feynmanTask: {
    moduleId: 'test-module-1',
    steps: [],
    finalPrompt: 'Explain this concept',
    rubric: [],
  },
  order: 1,
  origin: 'user',
}

describe('enterModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls setModule + resumeModule when allowResume=true (default) and module exists', () => {
    mockStorageGet.mockReturnValue(mockModule)

    const result = enterModule({ moduleId: 'test-module-1' })

    expect(result).toBe(true)
    expect(mockSetModule).toHaveBeenCalledWith(mockModule)
    expect(mockResumeModule).toHaveBeenCalledWith('test-module-1')
    expect(mockStartModule).not.toHaveBeenCalled()
  })

  it('calls setModule + startModule when allowResume=false and module exists', () => {
    mockStorageGet.mockReturnValue(mockModule)

    const result = enterModule({ moduleId: 'test-module-1', allowResume: false })

    expect(result).toBe(true)
    expect(mockSetModule).toHaveBeenCalledWith(mockModule)
    expect(mockStartModule).toHaveBeenCalledWith('test-module-1')
    expect(mockResumeModule).not.toHaveBeenCalled()
  })

  it('returns false and calls no store actions when module does not exist', () => {
    mockStorageGet.mockReturnValue(null)

    const result = enterModule({ moduleId: 'missing-module' })

    expect(result).toBe(false)
    expect(mockSetModule).not.toHaveBeenCalled()
    expect(mockResumeModule).not.toHaveBeenCalled()
    expect(mockStartModule).not.toHaveBeenCalled()
  })
})
