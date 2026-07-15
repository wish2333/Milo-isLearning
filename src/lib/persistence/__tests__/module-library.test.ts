// module-library.test.ts — Module Library repository helpers 单测
//
// 覆盖：
//   - listStoredModules: 空/多 Module 排序/quizCount/completed 计算
//   - loadStoredModule: 按 id 加载
//   - resetStoredModuleProgress: 重置进度保留 Module

import { beforeEach, describe, expect, it } from 'vitest'

import type { Concept, FeynmanStep, Module, ProgressState, Quiz } from '@/types/domain'

import { StorageKeys } from '../shared/keys'
import type { StorageRepository } from '../shared/repository'
import {
  listStoredModules,
  loadStoredModule,
  renameModule,
  resetStoredModuleProgress,
  updateQuizInModule,
} from '../module-library'

// =================================================================
// In-memory mock repository（复用 quota.test.ts 的 MockRepo 模式）
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

  setRaw(key: string, value: string): void {
    this.store.set(key, value)
  }
}
// =================================================================

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

function makeConcept(id: string, moduleId: string, quizCount: number): Concept {
  const quizzes: Quiz[] = []
  for (let i = 0; i < quizCount; i++) {
    quizzes.push(makeQuiz(`${id}:q${i}`, id))
  }
  return {
    id,
    moduleId,
    name: `Concept ${id}`,
    definition: 'def',
    type: 'fact',
    keyPoints: ['kp1'],
    quizSeries: { conceptId: id, quizzes },
    order: 1,
  }
}

function makeFeynmanStep(order: 1 | 2 | 3 | 4 | 5 | 6): FeynmanStep {
  return {
    order,
    type: 'choice',
    stem: `step ${order}`,
    options: ['a', 'b', 'c', 'd'],
    answer: 'a',
    explanation: 'exp',
  }
}

function makeFullModule(id: string): Module {
  const concept = makeConcept(`${id}:c1`, id, 2) // 2 quizzes
  const challengeQuiz = makeQuiz(`${id}:ch1`, `${id}:c1`)
  // 对于 quizCount 断言：2 concept quizzes + 1 challenge + 1 feynman step = 4
  const feynmanStep = makeFeynmanStep(1)
  return {
    id,
    sourceId: `source-${id}`,
    title: `Module ${id}`,
    intro: 'intro',
    goal: 'goal',
    concepts: [concept],
    feynmanTask: {
      moduleId: id,
      steps: [feynmanStep],
      finalPrompt: 'prompt',
      rubric: [],
    },
    challengeQuizzes: [challengeQuiz],
    order: 1,
    // v1.0.0 默认 showcase 模式，listStoredModules 按 origin 过滤；
    // 测试 Module 必须显式声明 origin 才能被 showcase 模式的过滤接受。
    origin: 'showcase',
  }
}

function makeProgress(moduleId: string, updatedAt: number, done = false): ProgressState {
  return {
    moduleId,
    stage: done ? { kind: 'done' } : { kind: 'module_intro' },
    updatedAt,
  }
}

function seedFullModule(
  repo: StorageRepository,
  moduleId: string,
  updatedAt: number,
  done = false,
): void {
  const storedModule = makeFullModule(moduleId)
  repo.set(StorageKeys.module(moduleId), storedModule)
  repo.set(StorageKeys.progress(moduleId), makeProgress(moduleId, updatedAt, done))
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

describe('listStoredModules', () => {
  let repo: MockRepo

  beforeEach(() => {
    repo = new MockRepo()
  })

  it('returns empty for empty repo', () => {
    const result = listStoredModules(repo)
    expect(result).toEqual([])
  })

  it('lists all stored modules sorted by updatedAt desc', () => {
    seedFullModule(repo, 'm1', 1000)
    seedFullModule(repo, 'm2', 3000)
    seedFullModule(repo, 'm3', 2000)

    const result = listStoredModules(repo)

    expect(result).toHaveLength(3)
    expect(result[0]!.id).toBe('m2') // 3000
    expect(result[1]!.id).toBe('m3') // 2000
    expect(result[2]!.id).toBe('m1') // 1000
  })

  it('computes correct quizCount and conceptCount', () => {
    seedFullModule(repo, 'm1', 1000)

    const result = listStoredModules(repo)

    expect(result).toHaveLength(1)
    expect(result[0]!.conceptCount).toBe(1) // 1 concept
    // 2 concept quizzes + 1 challenge + 1 feynman step = 4
    expect(result[0]!.quizCount).toBe(4)
  })

  it('reports completed=true when progress.stage.kind is done', () => {
    seedFullModule(repo, 'm1', 1000, true)

    const result = listStoredModules(repo)

    expect(result[0]!.completed).toBe(true)
  })

  it('reports completed=false when progress.stage.kind is not done', () => {
    seedFullModule(repo, 'm1', 1000, false)

    const result = listStoredModules(repo)

    expect(result[0]!.completed).toBe(false)
  })

  it('treats module without progress as updatedAt=0 (sorted last)', () => {
    seedFullModule(repo, 'm1', 1000)
    seedFullModule(repo, 'm2', 2000)
    // m3 has no progress, just a module entry
    repo.set(StorageKeys.module('m3'), makeFullModule('m3'))

    const result = listStoredModules(repo)

    expect(result).toHaveLength(3)
    // m2 (2000) > m1 (1000) > m3 (0)
    expect(result[0]!.id).toBe('m2')
    expect(result[1]!.id).toBe('m1')
    expect(result[2]!.id).toBe('m3')
    expect(result[2]!.updatedAt).toBe(0)
  })
})

describe('loadStoredModule', () => {
  let repo: MockRepo

  beforeEach(() => {
    repo = new MockRepo()
  })

  it('returns module for existing moduleId', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    const result = loadStoredModule(repo, 'm1')

    expect(result).not.toBeNull()
    expect(result!.id).toBe('m1')
    expect(result!.title).toBe('Module m1')
  })

  it('returns null for non-existent moduleId', () => {
    const result = loadStoredModule(repo, 'nonexistent')
    expect(result).toBeNull()
  })
})

describe('resetStoredModuleProgress', () => {
  let repo: MockRepo

  beforeEach(() => {
    repo = new MockRepo()
  })

  it('removes progress/feynman/attemptsModule but keeps module and source', () => {
    seedFullModule(repo, 'm1', 1000)
    repo.set(StorageKeys.feynman('m1'), {
      moduleId: 'm1',
      stepResults: [],
      submittedAt: 1000,
    })
    repo.set(StorageKeys.attemptsModule('m1'), { attemptsBySlot: { q1: [] } })

    resetStoredModuleProgress(repo, 'm1')

    // progress, feynman, attemptsModule should be gone
    expect(repo.has(StorageKeys.progress('m1'))).toBe(false)
    expect(repo.has(StorageKeys.feynman('m1'))).toBe(false)
    expect(repo.has(StorageKeys.attemptsModule('m1'))).toBe(false)

    // module and source should remain
    expect(repo.has(StorageKeys.module('m1'))).toBe(true)
    expect(repo.has(StorageKeys.source('source-m1'))).toBe(true)
  })
})

describe('renameModule', () => {
  let repo: MockRepo

  beforeEach(() => {
    repo = new MockRepo()
  })

  it('renames module title via round-trip (load -> rename -> load)', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    renameModule(repo, 'm1', 'New Title')

    const result = loadStoredModule(repo, 'm1')
    expect(result).not.toBeNull()
    expect(result!.title).toBe('New Title')
    expect(result!.id).toBe('m1') // id unchanged
  })

  it('trims whitespace from new title', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    renameModule(repo, 'm1', '  Spaced Title  ')

    const result = loadStoredModule(repo, 'm1')
    expect(result!.title).toBe('Spaced Title')
  })

  it('throws when new title is empty after trimming', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    expect(() => renameModule(repo, 'm1', '   ')).toThrow(
      'Module title must be 1-100 characters after trimming',
    )
  })

  it('throws when new title exceeds 100 characters', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    expect(() => renameModule(repo, 'm1', 'a'.repeat(101))).toThrow(
      'Module title must be 1-100 characters after trimming',
    )
  })

  it('accepts title at exactly 100 characters', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    const title100 = 'a'.repeat(100)
    renameModule(repo, 'm1', title100)

    const result = loadStoredModule(repo, 'm1')
    expect(result!.title).toBe(title100)
  })

  it('throws when module does not exist', () => {
    expect(() => renameModule(repo, 'nonexistent', 'Title')).toThrow('Module nonexistent not found')
  })

  it('does not modify module id or sourceId', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    renameModule(repo, 'm1', 'Renamed')

    const result = loadStoredModule(repo, 'm1')
    expect(result!.id).toBe('m1')
    expect(result!.sourceId).toBe('source-m1')
    expect(result!.intro).toBe('intro') // other fields preserved
  })
})

describe('updateQuizInModule', () => {
  let repo: MockRepo

  beforeEach(() => {
    repo = new MockRepo()
  })

  it('round-trip: change answer and reload shows new value', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    const targetQuizId = 'm1:c1:q0'
    const updated = updateQuizInModule(repo, 'm1', targetQuizId, { answer: 'NEW_ANSWER' })

    expect(updated.concepts[0]!.quizSeries.quizzes[0]!.answer).toBe('NEW_ANSWER')

    // round-trip: reload from storage
    const reloaded = loadStoredModule(repo, 'm1')
    expect(reloaded).not.toBeNull()
    expect(reloaded!.concepts[0]!.quizSeries.quizzes[0]!.answer).toBe('NEW_ANSWER')
  })

  it('does NOT affect sibling quizzes', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    const targetQuizId = 'm1:c1:q0'
    const siblingQuizId = 'm1:c1:q1'
    updateQuizInModule(repo, 'm1', targetQuizId, { answer: 'MODIFIED' })

    const reloaded = loadStoredModule(repo, 'm1')!
    const modified = reloaded.concepts[0]!.quizSeries.quizzes.find((q) => q.id === targetQuizId)
    const sibling = reloaded.concepts[0]!.quizSeries.quizzes.find((q) => q.id === siblingQuizId)

    expect(modified!.answer).toBe('MODIFIED')
    expect(sibling!.answer).toBe('a') // unchanged
  })

  it('throws on missing moduleId', () => {
    expect(() => updateQuizInModule(repo, 'nonexistent', 'some-quiz', { answer: 'X' })).toThrow(
      'Module nonexistent not found',
    )
  })

  it('throws on missing quizId', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    expect(() => updateQuizInModule(repo, 'm1', 'nonexistent-quiz', { answer: 'X' })).toThrow(
      'Quiz nonexistent-quiz not found in Module m1',
    )
  })

  it('patch { ignored: true } persists', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    const targetQuizId = 'm1:c1:q0'
    const updated = updateQuizInModule(repo, 'm1', targetQuizId, { ignored: true })

    expect(updated.concepts[0]!.quizSeries.quizzes[0]!.ignored).toBe(true)

    const reloaded = loadStoredModule(repo, 'm1')!
    expect(reloaded.concepts[0]!.quizSeries.quizzes[0]!.ignored).toBe(true)
    // sibling quiz should remain without ignored field
    expect(reloaded.concepts[0]!.quizSeries.quizzes[1]!.ignored).toBeUndefined()
  })

  it('finds and patches quiz in challengeQuizzes', () => {
    const storedModule = makeFullModule('m1')
    repo.set(StorageKeys.module('m1'), storedModule)

    const challengeQuizId = 'm1:ch1'
    const updated = updateQuizInModule(repo, 'm1', challengeQuizId, { answer: 'CH_ANSWER' })

    expect(updated.challengeQuizzes![0]!.answer).toBe('CH_ANSWER')

    const reloaded = loadStoredModule(repo, 'm1')!
    expect(reloaded.challengeQuizzes![0]!.answer).toBe('CH_ANSWER')
  })
})
