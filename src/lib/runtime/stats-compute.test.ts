import { describe, expect, it } from 'vitest'

import type { Module, SchedulingData } from '@/types/domain'
import { computeStats } from './stats-compute'

const now = new Date('2026-07-17T10:00:00.000Z')

function makeModule(id: string, quizId = `${id}-quiz`): Module {
  return {
    id,
    sourceId: `${id}-source`,
    title: id,
    intro: '',
    goal: '',
    concepts: [
      {
        id: `${id}-concept`,
        moduleId: id,
        name: '概念',
        definition: '',
        type: 'fact',
        keyPoints: [],
        order: 0,
        quizSeries: {
          conceptId: `${id}-concept`,
          quizzes: [
            {
              id: quizId,
              conceptId: `${id}-concept`,
              ladderLevel: 1,
              expressionLevel: 1,
              interactionType: 'choice',
              stem: '题目',
              options: ['A'],
              answer: 'A',
              explanation: '',
              distractors: [],
            },
          ],
        },
      },
    ],
    feynmanTask: { moduleId: id, steps: [], finalPrompt: '', rubric: [] },
    order: 1,
  }
}

function schedule(moduleId: string, slotId: string, due: string): SchedulingData {
  return {
    slotId,
    moduleId,
    conceptId: `${moduleId}-concept`,
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
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

function attempt(id: string, timestamp: number, score: number) {
  return {
    id,
    quizId: 'module-1-quiz',
    originalQuizId: 'module-1-quiz',
    attemptVersion: 0,
    userAnswer: 'A',
    score,
    gaps: [],
    nextAction: score >= 80 ? ('advance' as const) : ('retry' as const),
    timestamp,
  }
}

describe('computeStats', () => {
  it('counts due slots and unique due slots completed today in the requested timezone', () => {
    const storedModule = makeModule('module-1')
    const yesterdayLate = new Date('2026-07-16T23:30:00-07:00').getTime()
    const todayEarly = new Date('2026-07-17T00:30:00-07:00').getTime()
    const result = computeStats({
      modules: [storedModule],
      schedules: [
        schedule('module-1', 'module-1-quiz', '2026-07-17T09:00:00.000Z'),
        schedule('module-1', 'unknown', '2026-07-17T09:00:00.000Z'),
      ],
      attemptsBySlot: {
        'module-1-quiz': [attempt('old', yesterdayLate, 50), attempt('today', todayEarly, 90)],
      },
      streak: {
        currentStreak: 3,
        longestStreak: 5,
        lastStudyDate: '2026-07-17',
        totalStudyDays: 6,
      },
      now,
      timezone: 'America/Los_Angeles',
    })

    expect(result.todayDueCount).toBe(1)
    expect(result.todayCompletedCount).toBe(1)
    expect(result.currentStreak).toBe(3)
    expect(result.longestStreak).toBe(5)
  })

  it('computes a rolling seven-local-day accuracy and total answers', () => {
    const storedModule = makeModule('module-1')
    const attempts = [
      attempt('day0-correct', now.getTime() - 1_000, 100),
      attempt('day1-wrong', new Date('2026-07-16T12:00:00Z').getTime(), 20),
      attempt('day6-correct', new Date('2026-07-11T12:00:00Z').getTime(), 80),
      attempt('day7-out', new Date('2026-07-10T12:00:00Z').getTime(), 100),
    ]
    const result = computeStats({
      modules: [storedModule],
      schedules: [],
      attemptsBySlot: { 'module-1-quiz': attempts },
      now,
      timezone: 'Asia/Shanghai',
    })

    expect(result.sevenDayAttempts).toBe(3)
    expect(result.sevenDayCorrect).toBe(2)
    expect(result.sevenDayAccuracy).toBe(67)
    expect(result.totalAttempts).toBe(4)
    expect(result.moduleCount).toBe(1)
  })

  it('does not mix attempts from modules outside the visible module set', () => {
    const storedModule = makeModule('module-1')
    const result = computeStats({
      modules: [storedModule],
      schedules: [],
      attemptsBySlot: {
        'module-1-quiz': [attempt('visible', now.getTime(), 100)],
        'other-module-quiz': [
          { ...attempt('hidden', now.getTime(), 0), quizId: 'other-module-quiz' },
        ],
      },
      now,
      timezone: 'UTC',
    })

    expect(result.totalAttempts).toBe(1)
    expect(result.sevenDayAttempts).toBe(1)
    expect(result.sevenDayCorrect).toBe(1)
  })

  it('returns zero accuracy and ignores schedules for ignored quizzes', () => {
    const storedModule = makeModule('module-1')
    storedModule.concepts[0]!.quizSeries.quizzes[0]!.ignored = true
    const result = computeStats({
      modules: [storedModule],
      schedules: [schedule('module-1', 'module-1-quiz', '2026-07-16T00:00:00.000Z')],
      attemptsBySlot: {},
      now,
      timezone: 'UTC',
    })

    expect(result.todayDueCount).toBe(0)
    expect(result.todayCompletedCount).toBe(0)
    expect(result.sevenDayAccuracy).toBe(0)
  })
})
