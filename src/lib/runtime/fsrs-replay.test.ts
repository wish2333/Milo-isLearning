import { describe, expect, it } from 'vitest'

import type { AttemptRecord, Quiz } from '@/types/domain'

import { applyRating, createSchedule, inferRating } from './fsrs'
import { rebuildScheduleForSlot } from './fsrs-replay'

const replayConfig = { requestRetention: 0.9, maximumInterval: 365 }

function quiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: 'quiz-1',
    conceptId: 'concept-1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: '题干',
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: '解释',
    distractors: ['B', 'C', 'D'],
    ...overrides,
  }
}

function attempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: 'attempt-1',
    quizId: 'quiz-1',
    originalQuizId: 'concept-1:0',
    attemptVersion: 0,
    userAnswer: 'A',
    score: 100,
    gaps: [],
    nextAction: 'advance',
    timestamp: Date.parse('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

function rebuild(
  attempts: AttemptRecord[],
  overrides: Partial<Parameters<typeof rebuildScheduleForSlot>[0]> = {},
) {
  return rebuildScheduleForSlot({
    slotId: 'concept-1:0',
    moduleId: 'module-1',
    conceptId: 'concept-1',
    quiz: quiz(),
    attempts,
    contentRevision: 'content-v1',
    configRevision: 'config-v1',
    fsrsConfig: replayConfig,
    ...overrides,
  })
}

describe('rebuildScheduleForSlot', () => {
  it('returns null without an attempt history', () => {
    expect(rebuild([])).toBeNull()
  })

  it('replays first Good and Again with the locked FSRS-6 parameters', () => {
    const timestamp = Date.parse('2026-01-01T00:00:00.000Z')
    const good = rebuild([attempt({ timestamp })])
    const again = rebuild([attempt({ timestamp, score: 79 })])

    expect(good).toMatchObject({ state: 'learning', stability: expect.closeTo(2.3065) })
    expect(again).toMatchObject({ state: 'learning', stability: expect.closeTo(0.212) })
    expect(good?.learning_steps).toBeDefined()
    expect(again?.learning_steps).toBeDefined()
  })

  it('uses Hard for guessed correct answers, resulting in lower stability than Good', () => {
    const guessed = rebuild([attempt({ guessed: true })])
    const good = rebuild([attempt()])

    expect(guessed?.stability).toBeLessThan(good!.stability)
  })

  it('accumulates each attempt using its original timestamp', () => {
    const attempts = [
      attempt({ id: 'attempt-1', timestamp: Date.parse('2026-01-01T00:00:00.000Z') }),
      attempt({
        id: 'attempt-2',
        score: 79,
        timestamp: Date.parse('2026-01-02T00:00:00.000Z'),
      }),
    ]
    const actual = rebuild(attempts)
    const start = createSchedule(
      'concept-1:0',
      'module-1',
      'concept-1',
      new Date(attempts[0]!.timestamp),
    )
    const expected = applyRating(
      applyRating(start, inferRating(attempts[0]!), new Date(attempts[0]!.timestamp)),
      inferRating(attempts[1]!),
      new Date(attempts[1]!.timestamp),
    )

    expect(actual).toMatchObject({
      ...expected,
      contentRevision: 'content-v1',
      configRevision: 'config-v1',
      lastAppliedAttemptId: 'attempt-2',
    })
  })

  it('writes the supplied content and config revisions as derived-cache metadata', () => {
    expect(
      rebuild([attempt()], { contentRevision: 'content-v2', configRevision: 'config-v2' }),
    ).toMatchObject({
      contentRevision: 'content-v2',
      configRevision: 'config-v2',
      lastAppliedAttemptId: 'attempt-1',
    })
  })

  it('sorts attempts by timestamp and then id before replaying', () => {
    const timestamp = Date.parse('2026-01-01T00:00:00.000Z')
    const alphaAgain = attempt({ id: 'alpha', score: 79, timestamp })
    const betaGood = attempt({ id: 'beta', score: 100, timestamp })
    const actual = rebuild([betaGood, alphaAgain])
    const start = createSchedule('concept-1:0', 'module-1', 'concept-1', new Date(timestamp))
    const expected = applyRating(
      applyRating(start, inferRating(alphaAgain), new Date(timestamp)),
      inferRating(betaGood),
      new Date(timestamp),
    )

    expect(actual).toMatchObject({
      ...expected,
      contentRevision: 'content-v1',
      configRevision: 'config-v1',
      lastAppliedAttemptId: 'beta',
    })
  })
})
