import { describe, expect, it } from 'vitest'

import type { AttemptRecord } from '@/types/domain'

import { Rating, State, applyRating, createSchedule, inferRating, isDue } from './fsrs'

function attempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: 'attempt-1',
    quizId: 'quiz-1',
    originalQuizId: 'concept-1:0',
    attemptVersion: 0,
    userAnswer: 'answer',
    score: 100,
    gaps: [],
    nextAction: 'advance',
    timestamp: Date.parse('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('inferRating', () => {
  it('maps score below 80 to Again before other signals', () => {
    expect(inferRating(attempt({ score: 79, guessed: true, timeSpentMs: 1000 }))).toBe(Rating.Again)
  })

  it('maps guessed successful answers to Hard', () => {
    expect(inferRating(attempt({ guessed: true }))).toBe(Rating.Hard)
  })

  it('maps fast successful answers to Easy', () => {
    expect(inferRating(attempt({ timeSpentMs: 4999 }))).toBe(Rating.Easy)
    expect(inferRating(attempt({ timeSpentMs: 5000 }))).toBe(Rating.Good)
  })

  it('maps ordinary successful answers to Good', () => {
    expect(inferRating(attempt({ timeSpentMs: undefined }))).toBe(Rating.Good)
  })
})

describe('createSchedule/applyRating', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')

  it('creates a new card with stable metadata defaults', () => {
    const schedule = createSchedule('concept-1:0', 'module-1', 'concept-1', now)
    expect(schedule).toMatchObject({
      slotId: 'concept-1:0',
      moduleId: 'module-1',
      conceptId: 'concept-1',
      state: 'new',
      reps: 0,
      lapses: 0,
      schemaVersion: 1,
      contentRevision: '',
      configRevision: '',
      lastAppliedAttemptId: '',
      due: now.toISOString(),
      last_review: null,
    })
  })

  it('maps official FSRS-6 first-review states with complete parameters', () => {
    const empty = createSchedule('slot', 'module', 'concept', now)
    const again = applyRating(empty, Rating.Again, now)
    const good = applyRating(empty, Rating.Good, now)
    const easy = applyRating(empty, Rating.Easy, now)

    // With the locked default learning steps, Again/Good are Learning; Easy enters Review.
    expect(again.state).toBe('learning')
    expect(good.state).toBe('learning')
    expect(easy.state).toBe('review')
    expect(again.stability).toBeCloseTo(0.212)
    expect(good.stability).toBeCloseTo(2.3065)
    expect(easy.stability).toBeCloseTo(8.2956)
  })

  it('preserves metadata and supports the official Relearning state', () => {
    const review = applyRating(
      {
        ...createSchedule('slot', 'module', 'concept', now),
        state: 'review',
        stability: 10,
        difficulty: 5,
        reps: 4,
        due: '2026-01-10T00:00:00.000Z',
        last_review: now.toISOString(),
        contentRevision: 'content-v1',
        configRevision: 'config-v1',
        lastAppliedAttemptId: 'attempt-1',
      },
      Rating.Again,
      new Date('2026-01-10T00:00:00.000Z'),
    )
    expect(review.slotId).toBe('slot')
    expect(review.contentRevision).toBe('content-v1')
    expect(review.configRevision).toBe('config-v1')
    expect(review.lastAppliedAttemptId).toBe('attempt-1')
    expect([State.Learning, State.Relearning].map((state) => stateToLabel(state))).toContain(
      review.state,
    )
  })
})

describe('isDue', () => {
  it('uses the requested timezone at an exact due boundary', () => {
    const schedule = createSchedule('slot', 'module', 'concept', new Date('2026-01-01T00:00:00Z'))
    const due = { ...schedule, due: '2026-07-17T00:00:00.000Z' }
    expect(isDue(due, new Date('2026-07-16T23:59:59.999Z'), 'Asia/Shanghai')).toBe(false)
    expect(isDue(due, new Date('2026-07-17T00:00:00.000Z'), 'Asia/Shanghai')).toBe(true)
  })

  it('does not use a server timezone when crossing a local calendar boundary', () => {
    const schedule = createSchedule('slot', 'module', 'concept', new Date('2026-01-01T00:00:00Z'))
    const due = { ...schedule, due: '2026-07-16T23:30:00.000Z' }
    expect(isDue(due, new Date('2026-07-17T00:00:00.000Z'), 'Asia/Shanghai')).toBe(true)
  })
})

function stateToLabel(state: State): 'learning' | 'relearning' | 'new' | 'review' {
  switch (state) {
    case State.New:
      return 'new'
    case State.Learning:
      return 'learning'
    case State.Review:
      return 'review'
    case State.Relearning:
      return 'relearning'
  }
}
