import { describe, expect, it } from 'vitest'

import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import type { StorageRepository } from '@/lib/persistence/shared/repository'
import type { AttemptRecord, Quiz } from '@/types/domain'

import { synchronizeScheduleForSlot } from './fsrs-schedule-coordinator'

class MemoryRepository implements StorageRepository {
  private readonly values = new Map<string, string>()

  get<T>(key: string): T | null {
    const value = this.values.get(key)
    return value === undefined ? null : (JSON.parse(value) as T)
  }

  set<T>(key: string, value: T): void {
    this.values.set(key, JSON.stringify(value))
  }

  remove(key: string): void {
    this.values.delete(key)
  }

  has(key: string): boolean {
    return this.values.has(key)
  }

  keys(): string[] {
    return [...this.values.keys()]
  }

  getRaw(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setRaw(key: string, value: string): void {
    this.values.set(key, value)
  }

  clearAll(): void {
    this.values.clear()
  }
}

function makeQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: 'quiz-1',
    conceptId: 'concept-1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: '题干',
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: '解析',
    distractors: ['B', 'C', 'D'],
    ...overrides,
  }
}

function makeAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: 'attempt-1',
    quizId: 'quiz-1',
    originalQuizId: 'slot-1',
    attemptVersion: 0,
    userAnswer: 'A',
    score: 100,
    gaps: [],
    nextAction: 'advance',
    timestamp: 1_700_000_000_000,
    ...overrides,
  }
}

describe('synchronizeScheduleForSlot', () => {
  it.each([
    ['ConceptView 作答', 'module-concept', 'concept-1', makeQuiz()],
    ['ChallengeView 作答', 'module-challenge', 'challenge', makeQuiz({ conceptId: 'challenge' })],
    [
      '单模块重刷作答',
      'module-review',
      'concept-review',
      makeQuiz({ conceptId: 'concept-review' }),
    ],
    [
      '主题重刷作答',
      'module-topic-review',
      'concept-topic',
      makeQuiz({ conceptId: 'concept-topic' }),
    ],
  ])('%s 的显式上下文会同步调度缓存', (_source, moduleId, conceptId, quiz) => {
    const repository = new MemoryRepository()
    const slotId = `${moduleId}-slot`
    const result = synchronizeScheduleForSlot({
      slotId,
      moduleId,
      conceptId,
      quiz,
      attempts: [makeAttempt({ originalQuizId: slotId, moduleId, conceptId })],
      repository,
    })

    expect(result).toBe('set')
    expect(scheduleLibrary.get(slotId, repository)).toMatchObject({ slotId, moduleId, conceptId })
  })

  it('在历史清空后删除已有派生缓存', () => {
    const repository = new MemoryRepository()
    const quiz = makeQuiz()
    const params = {
      slotId: 'slot-1',
      moduleId: 'module-1',
      conceptId: 'concept-1',
      quiz,
      repository,
    }

    synchronizeScheduleForSlot({ ...params, attempts: [makeAttempt()] })
    expect(scheduleLibrary.get(params.slotId, repository)).not.toBeNull()

    expect(synchronizeScheduleForSlot({ ...params, attempts: [] })).toBe('removed')
    expect(scheduleLibrary.get(params.slotId, repository)).toBeNull()
  })
})
