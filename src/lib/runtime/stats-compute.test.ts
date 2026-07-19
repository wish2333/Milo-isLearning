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

  it('builds local 7/30-day trends and counts the earliest attempt per slot as first answer', () => {
    const storedModule = makeModule('module-1')
    const first = attempt('first', new Date('2026-07-17T06:59:00.000Z').getTime(), 90)
    const duplicateFirst = { ...first, score: 0 }
    const retry = attempt('retry', new Date('2026-07-17T07:01:00.000Z').getTime(), 20)
    const older = attempt('older', new Date('2026-06-18T19:00:00.000Z').getTime(), 50)

    const result = computeStats({
      modules: [storedModule],
      schedules: [schedule('module-1', 'module-1-quiz', '2026-07-17T07:00:00.000Z')],
      // The first record is intentionally duplicated with the same id. The
      // duplicate must not become another attempt or alter first-answer data.
      attemptsBySlot: {
        'module-1-quiz': [first, duplicateFirst, retry, older],
      },
      now,
      timezone: 'America/Los_Angeles',
    })

    expect(result.sevenDayTrend).toHaveLength(7)
    expect(result.thirtyDayTrend).toHaveLength(30)
    expect(result.sevenDayTrend[5]).toMatchObject({
      date: '2026-07-16',
      attemptCount: 1,
      firstAttemptCount: 0,
      firstCorrectCount: 0,
      firstCorrectRate: 0,
      newAttemptCount: 0,
      reviewAttemptCount: 1,
      studyDay: true,
    })
    expect(result.sevenDayTrend[6]).toMatchObject({
      date: '2026-07-17',
      attemptCount: 1,
      correctCount: 0,
      firstAttemptCount: 0,
      reviewAttemptCount: 1,
      studyDay: true,
    })
    expect(result.sevenDayAttempts).toBe(2)
    expect(result.sevenDayCorrect).toBe(1)
    expect(result.sevenDayAccuracy).toBe(50)
    expect(result.sevenDayStudyDays).toBe(2)
    expect(result.thirtyDayTrend[0]).toMatchObject({
      date: '2026-06-18',
      attemptCount: 1,
      firstAttemptCount: 1,
      firstCorrectCount: 0,
      firstCorrectRate: 0,
      newAttemptCount: 1,
    })
    expect(result.thirtyDayStudyDays).toBe(3)
    expect(result.totalAttempts).toBe(3)
  })

  it('uses due dates in the requested timezone and keeps overdue completion explicit', () => {
    const storedModule = makeModule('module-1')
    const overdueDue = '2026-07-17T06:59:00.000Z' // Jul 16 23:59 in Los Angeles.
    const completedAfterMidnight = attempt(
      'after-midnight',
      new Date('2026-07-17T07:01:00.000Z').getTime(),
      100,
    )
    const result = computeStats({
      modules: [storedModule],
      schedules: [schedule('module-1', 'module-1-quiz', overdueDue)],
      attemptsBySlot: { 'module-1-quiz': [completedAfterMidnight] },
      now,
      timezone: 'America/Los_Angeles',
    })

    expect(result.todayDueCount).toBe(1)
    expect(result.todayCompletedCount).toBe(1)
    expect(result.sevenDayTrend[5]).toMatchObject({
      date: '2026-07-16',
      dueCount: 1,
      dueCompletedCount: 0,
      dueCompletionRate: 0,
    })
    expect(result.sevenDayTrend[6]).toMatchObject({
      date: '2026-07-17',
      dueCount: 1,
      dueCompletedCount: 1,
      dueCompletionRate: 100,
    })
  })

  it('returns stable empty windows and falls back to UTC for an invalid timezone', () => {
    const result = computeStats({
      modules: [],
      schedules: [],
      attemptsBySlot: {},
      now,
      timezone: 'Not/A-Timezone',
    })

    expect(result.sevenDayTrend).toHaveLength(7)
    expect(result.thirtyDayTrend).toHaveLength(30)
    expect(result.sevenDayTrend[0]!.date).toBe('2026-07-11')
    expect(result.sevenDayTrend.at(-1)!.date).toBe('2026-07-17')
    expect(result.sevenDayStudyDays).toBe(0)
    expect(result.thirtyDayStudyDays).toBe(0)
    expect(result.todayDueCount).toBe(0)
    expect(result.totalAttempts).toBe(0)
  })

  it('keeps retries from a legacy bucket when only the first quiz id is visible', () => {
    const storedModule = makeModule('module-1')
    const first = attempt('legacy-first', now.getTime() - 1_000, 20)
    const retry = {
      ...attempt('legacy-retry', now.getTime(), 100),
      quizId: 'generated-retry-quiz',
    }

    const result = computeStats({
      modules: [storedModule],
      schedules: [],
      attemptsBySlot: {
        'legacy-quiz-id': [{ ...first, quizId: 'module-1-quiz' }, retry],
      },
      now,
      timezone: 'UTC',
    })

    expect(result.totalAttempts).toBe(2)
    expect(result.sevenDayAttempts).toBe(2)
    expect(result.sevenDayCorrect).toBe(1)
    expect(result.sevenDayTrend.at(-1)).toMatchObject({
      attemptCount: 2,
      firstAttemptCount: 1,
      reviewAttemptCount: 1,
    })
  })
})
