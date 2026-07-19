import { describe, expect, it } from 'vitest'

import type { AttemptRecord, Module, Quiz } from '@/types/domain'
import type { StorageRepository } from '@/lib/persistence/shared/repository'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'

import { rebuildAllSchedulesIfNeeded } from './fsrs-migrate'

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

function quiz(id = 'quiz-1'): Quiz {
  return {
    id,
    conceptId: 'concept-1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: '题干',
    options: ['A', 'B'],
    answer: 'A',
    explanation: '解释',
    distractors: ['B'],
  }
}

function moduleWithQuiz(currentQuiz: Quiz = quiz()): Module {
  return {
    id: 'module-1',
    sourceId: 'source-1',
    title: '模块',
    intro: '简介',
    goal: '目标',
    concepts: [
      {
        id: 'concept-1',
        moduleId: 'module-1',
        name: '概念',
        definition: '定义',
        type: 'fact',
        keyPoints: [],
        quizSeries: { conceptId: 'concept-1', quizzes: [currentQuiz] },
        order: 0,
      },
    ],
    feynmanTask: { moduleId: 'module-1', steps: [], finalPrompt: '', rubric: [] },
    order: 1,
  }
}

function attempt(slotId: string, overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: `attempt-${slotId}`,
    quizId: 'quiz-1',
    originalQuizId: slotId,
    attemptVersion: 0,
    userAnswer: 'A',
    score: 100,
    gaps: [],
    nextAction: 'advance',
    timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('fsrs-migrate', () => {
  it('scans module context and replays old attempts without parsing slot ids', () => {
    const repository = new MemoryRepository()
    repository.set(StorageKeys.module('module-1'), moduleWithQuiz())

    const summary = rebuildAllSchedulesIfNeeded({
      repository,
      attemptsBySlot: { 'legacy|slot': [attempt('legacy|slot')] },
      fsrsConfig: { requestRetention: 0.9, maximumInterval: 365 },
    })

    expect(summary).toMatchObject({ replayed: true, rebuiltSlots: 1, unresolvedSlots: 0 })
    expect(scheduleLibrary.get('legacy|slot', repository)).toMatchObject({
      moduleId: 'module-1',
      conceptId: 'concept-1',
    })
  })

  it('replays again when any cached config revision is stale', () => {
    const repository = new MemoryRepository()
    repository.set(StorageKeys.module('module-1'), moduleWithQuiz())
    const attemptsBySlot = { 'quiz-1': [attempt('quiz-1')] }

    rebuildAllSchedulesIfNeeded({
      repository,
      attemptsBySlot,
      fsrsConfig: { requestRetention: 0.9, maximumInterval: 365 },
    })
    const firstRevision = scheduleLibrary.get('quiz-1', repository)?.configRevision
    const second = rebuildAllSchedulesIfNeeded({
      repository,
      attemptsBySlot,
      fsrsConfig: { requestRetention: 0.95, maximumInterval: 365 },
    })

    expect(second.replayed).toBe(true)
    expect(scheduleLibrary.get('quiz-1', repository)?.configRevision).not.toBe(firstRevision)
  })

  it('removes ignored quiz schedules during replay', () => {
    const repository = new MemoryRepository()
    repository.set(StorageKeys.module('module-1'), moduleWithQuiz({ ...quiz(), ignored: true }))
    scheduleLibrary.set(
      'quiz-1',
      {
        slotId: 'quiz-1',
        moduleId: 'module-1',
        conceptId: 'concept-1',
        stability: 1,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 1,
        lapses: 0,
        state: 'learning',
        due: '2026-01-01T00:00:00Z',
        last_review: null,
        schemaVersion: 1,
        contentRevision: 'old',
        configRevision: 'old',
        lastAppliedAttemptId: 'attempt-quiz-1',
      },
      repository,
    )

    rebuildAllSchedulesIfNeeded({
      repository,
      attemptsBySlot: { 'quiz-1': [attempt('quiz-1')] },
      fsrsConfig: { requestRetention: 0.9, maximumInterval: 365 },
    })

    expect(scheduleLibrary.get('quiz-1', repository)).toBeNull()
  })
})
