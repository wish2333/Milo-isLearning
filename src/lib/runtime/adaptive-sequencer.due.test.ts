import { beforeEach, describe, expect, it } from 'vitest'

import type { SchedulingData } from '@/types/domain'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import { collectConfirmSlots, collectDueSlots, collectReviewSlots } from './adaptive-sequencer'
import type { AttemptRecord, Module } from '@/types/domain'
import type { StorageRepository } from '@/lib/persistence/shared/repository'
import { StorageKeys } from '@/lib/persistence/shared/keys'

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

function schedule(slotId: string, moduleId: string, due: string): SchedulingData {
  return {
    slotId,
    moduleId,
    conceptId: 'concept-1',
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    state: 'review',
    due,
    last_review: null,
    schemaVersion: 1,
    contentRevision: 'content',
    configRevision: 'config',
    lastAppliedAttemptId: 'attempt',
  }
}

function moduleFixture(): Module {
  return {
    id: 'module-due',
    sourceId: 'source',
    title: 'module',
    intro: '',
    goal: '',
    concepts: [
      {
        id: 'concept-1',
        moduleId: 'module-due',
        name: 'concept',
        definition: '',
        type: 'fact',
        keyPoints: [],
        quizSeries: {
          conceptId: 'concept-1',
          quizzes: [
            {
              id: 'slot-due',
              conceptId: 'concept-1',
              ladderLevel: 1,
              expressionLevel: 1,
              interactionType: 'choice',
              stem: 'q',
              options: ['A'],
              answer: 'A',
              explanation: '',
              distractors: [],
            },
            {
              id: 'slot-future',
              conceptId: 'concept-1',
              ladderLevel: 1,
              expressionLevel: 1,
              interactionType: 'choice',
              stem: 'q',
              options: ['A'],
              answer: 'A',
              explanation: '',
              distractors: [],
            },
          ],
        },
        order: 0,
      },
    ],
    feynmanTask: { moduleId: 'module-due', steps: [], finalPrompt: '', rubric: [] },
    order: 0,
  }
}

describe('collectDueSlots and FSRS sequencing', () => {
  beforeEach(() => scheduleLibrary.clearAll())

  it('collects dueNow slots and excludes future schedules', () => {
    const now = new Date('2026-07-17T12:00:00.000Z')
    const repo = new MemoryRepository()
    repo.set(
      StorageKeys.schedule('slot-due'),
      schedule('slot-due', 'module-due', '2026-07-16T12:00:00.000Z'),
    )
    repo.set(
      StorageKeys.schedule('slot-future'),
      schedule('slot-future', 'module-due', '2026-07-18T12:00:00.000Z'),
    )
    expect(collectDueSlots('module-due', 'Asia/Shanghai', now, repo)).toEqual(['slot-due'])
  })

  it('uses due slots for review and disables confirmation when FSRS is enabled', () => {
    const moduleData = moduleFixture()
    const repo = new MemoryRepository()
    repo.set(
      StorageKeys.schedule('slot-due'),
      schedule('slot-due', 'module-due', '2026-07-16T12:00:00.000Z'),
    )
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'slot-due': [],
      'slot-future': [],
    }
    expect(
      collectReviewSlots(moduleData, 0, attemptsBySlot, {
        fsrsEnabled: true,
        timezone: 'Asia/Shanghai',
        repository: repo,
        now: new Date('2026-07-17T12:00:00.000Z'),
      }),
    ).toEqual(['slot-due'])
    expect(collectConfirmSlots(moduleData, 0, attemptsBySlot, { fsrsEnabled: true })).toEqual([])
  })
})
