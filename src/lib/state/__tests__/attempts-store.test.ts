import { describe, it, expect, beforeEach } from 'vitest'
import { useAttemptsStore } from '../attempts-store'
import type { AttemptRecord, Quiz } from '@/types/domain'

function makeAttempt(
  slotId: string,
  score: number,
  overrides?: Partial<AttemptRecord>,
): AttemptRecord {
  return {
    id: `attempt-${Date.now()}-${Math.random()}`,
    quizId: slotId,
    originalQuizId: slotId,
    userAnswer: 'test',
    score,
    gaps: [],
    nextAction: score >= 80 ? 'advance' : 'advance',
    timestamp: Date.now(),
    attemptVersion: 0,
    ...overrides,
  }
}

describe('attempts-store markGuessed / unmarkGuessed', () => {
  beforeEach(() => {
    useAttemptsStore.getState().clearAll()
  })

  it('markGuessed sets guessed=true on last attempt', () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-1'
    store.addAttempt(makeAttempt(slotId, 100))
    store.markGuessed(slotId)

    const attempts = store.getAttempts(slotId)
    expect(attempts[attempts.length - 1]!.guessed).toBe(true)
  })

  it('unmarkGuessed removes guessed field from last attempt', () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-1'
    store.addAttempt(makeAttempt(slotId, 100))
    store.markGuessed(slotId)
    store.unmarkGuessed(slotId)

    const attempts = store.getAttempts(slotId)
    expect(attempts[attempts.length - 1]!.guessed).toBeUndefined()
  })

  it('unmarkGuessed is no-op when last attempt is not guessed', () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-1'
    store.addAttempt(makeAttempt(slotId, 100))
    store.unmarkGuessed(slotId)

    const attempts = store.getAttempts(slotId)
    expect(attempts[attempts.length - 1]!.guessed).toBeUndefined()
  })

  it('mark then unmark then mark again works', () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-1'
    store.addAttempt(makeAttempt(slotId, 100))

    store.markGuessed(slotId)
    expect(store.getAttempts(slotId).at(-1)!.guessed).toBe(true)

    store.unmarkGuessed(slotId)
    expect(store.getAttempts(slotId).at(-1)!.guessed).toBeUndefined()

    store.markGuessed(slotId)
    expect(store.getAttempts(slotId).at(-1)!.guessed).toBe(true)
  })
})

describe('attempts-store F13 answeredAt / timeSpentMs', () => {
  beforeEach(() => {
    useAttemptsStore.getState().clearAll()
  })

  it('addAttempt preserves answeredAt and timeSpentMs', () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-1'
    const now = Date.now()
    store.addAttempt(makeAttempt(slotId, 100, { answeredAt: now, timeSpentMs: 15000 }))

    const attempts = store.getAttempts(slotId)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]!.answeredAt).toBe(now)
    expect(attempts[0]!.timeSpentMs).toBe(15000)
  })

  it('old attempts without answeredAt/timeSpentMs remain valid', () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-1'
    store.addAttempt(makeAttempt(slotId, 100))

    const attempts = store.getAttempts(slotId)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]!.answeredAt).toBeUndefined()
    expect(attempts[0]!.timeSpentMs).toBeUndefined()
  })

  it('markGuessed preserves answeredAt and timeSpentMs', () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-1'
    const now = Date.now()
    store.addAttempt(makeAttempt(slotId, 100, { answeredAt: now, timeSpentMs: 10000 }))
    store.markGuessed(slotId)

    const attempts = store.getAttempts(slotId)
    expect(attempts.at(-1)!.guessed).toBe(true)
    expect(attempts.at(-1)!.answeredAt).toBe(now)
    expect(attempts.at(-1)!.timeSpentMs).toBe(10000)
  })

  it('unmarkGuessed preserves answeredAt and timeSpentMs', () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-1'
    const now = Date.now()
    store.addAttempt(makeAttempt(slotId, 100, { answeredAt: now, timeSpentMs: 20000 }))
    store.markGuessed(slotId)
    store.unmarkGuessed(slotId)

    const attempts = store.getAttempts(slotId)
    expect(attempts.at(-1)!.guessed).toBeUndefined()
    expect(attempts.at(-1)!.answeredAt).toBe(now)
    expect(attempts.at(-1)!.timeSpentMs).toBe(20000)
  })
})

describe('attempts-store reevaluateLastAttempt', () => {
  beforeEach(() => {
    useAttemptsStore.getState().clearAll()
  })

  it('re-evaluates wrong answer to correct after quiz correction (choice)', async () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-1'

    // Original quiz had wrong answer labeled as correct
    const originalQuiz: Quiz = {
      id: slotId,
      conceptId: 'c1',
      ladderLevel: 1,
      expressionLevel: 1,
      interactionType: 'choice',
      stem: 'test?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'WRONG', // mislabeled: "B" was the correct answer
      explanation: 'e',
      distractors: ['A', 'C', 'D'],
    }

    const attempt = makeAttempt(slotId, 100, {
      quizId: slotId,
      originalQuizId: slotId,
      userAnswer: 'B',
      score: 100,
      gaps: [],
      nextAction: 'advance',
      guessed: true,
    })
    store.addAttempt(attempt)

    // Corrected quiz: answer is now "B"
    const correctedQuiz: Quiz = {
      ...originalQuiz,
      answer: 'B',
    }

    await store.reevaluateLastAttempt(slotId, correctedQuiz)

    const attempts = store.getAttempts(slotId)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]!.score).toBe(100)
    expect(attempts[0]!.nextAction).toBe('advance')
    expect(attempts[0]!.userAnswer).toBe('B')
  })

  it('flips score from 100 to 0 when corrected quiz reveals wrong answer', async () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-2'

    // Quiz originally had answer "B" but user answered "A" — yet got score 100 (mislabeled)
    const originalQuiz: Quiz = {
      id: slotId,
      conceptId: 'c1',
      ladderLevel: 1,
      expressionLevel: 1,
      interactionType: 'choice',
      stem: 'test?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'A', // was mislabeled
      explanation: 'e',
      distractors: ['B', 'C', 'D'],
    }

    const attempt = makeAttempt(slotId, 100, {
      quizId: slotId,
      originalQuizId: slotId,
      userAnswer: 'A',
      score: 100,
      gaps: [],
      nextAction: 'advance',
    })
    store.addAttempt(attempt)

    // Corrected: answer is now "B", user's "A" is wrong
    const correctedQuiz: Quiz = {
      ...originalQuiz,
      answer: 'B',
    }

    await store.reevaluateLastAttempt(slotId, correctedQuiz)

    const attempts = store.getAttempts(slotId)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]!.score).toBe(0)
    expect(attempts[0]!.nextAction).toBe('retry')
    expect(attempts[0]!.gaps.length).toBeGreaterThan(0)
  })

  it('does NOT add a new AttemptRecord', async () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-3'

    const quiz: Quiz = {
      id: slotId,
      conceptId: 'c1',
      ladderLevel: 1,
      expressionLevel: 1,
      interactionType: 'choice',
      stem: 'test?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'A',
      explanation: 'e',
      distractors: ['B', 'C'],
    }

    store.addAttempt(makeAttempt(slotId, 0, { userAnswer: 'B' }))
    expect(store.getAttempts(slotId)).toHaveLength(1)

    await store.reevaluateLastAttempt(slotId, quiz)
    expect(store.getAttempts(slotId)).toHaveLength(1)
  })

  it('preserves id, originalQuizId, userAnswer, timestamp, guessed', async () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-4'

    const quiz: Quiz = {
      id: slotId,
      conceptId: 'c1',
      ladderLevel: 1,
      expressionLevel: 1,
      interactionType: 'choice',
      stem: 'test?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'A',
      explanation: 'e',
      distractors: ['B', 'C'],
    }

    const now = 1700000000000
    const attempt = makeAttempt(slotId, 0, {
      id: 'fixed-attempt-id',
      quizId: 'quiz-1',
      originalQuizId: slotId,
      userAnswer: 'B',
      timestamp: now,
      guessed: true,
      answeredAt: now,
      timeSpentMs: 5000,
    })
    store.addAttempt(attempt)

    await store.reevaluateLastAttempt(slotId, quiz)

    const last = store.getAttempts(slotId)[0]!
    expect(last.id).toBe('fixed-attempt-id')
    expect(last.originalQuizId).toBe(slotId)
    expect(last.userAnswer).toBe('B')
    expect(last.timestamp).toBe(now)
    expect(last.guessed).toBe(true)
    expect(last.answeredAt).toBe(now)
    expect(last.timeSpentMs).toBe(5000)
  })

  it('no-op on empty slot returns default FeedbackRuntime', async () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-5'

    const quiz: Quiz = {
      id: slotId,
      conceptId: 'c1',
      ladderLevel: 1,
      expressionLevel: 1,
      interactionType: 'choice',
      stem: 'test?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'A',
      explanation: 'e',
      distractors: ['B'],
    }

    expect(store.getAttempts(slotId)).toHaveLength(0)
    const result = await store.reevaluateLastAttempt(slotId, quiz)
    expect(store.getAttempts(slotId)).toHaveLength(0)
    expect(result).toEqual({ score: 0, gaps: [], nextAction: 'retry', feedbackText: '' })
  })

  it('updates gaps correctly on re-evaluation', async () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-6'

    const quiz: Quiz = {
      id: slotId,
      conceptId: 'c1',
      ladderLevel: 1,
      expressionLevel: 1,
      interactionType: 'choice',
      stem: 'test?',
      options: ['A', 'B', 'C', 'D'],
      answer: 'A',
      explanation: 'e',
      distractors: ['B', 'C', 'D'],
    }

    // User answered wrong "C" — had empty gaps (mislabeled correct)
    store.addAttempt(
      makeAttempt(slotId, 100, {
        userAnswer: 'C',
        score: 100,
        gaps: [],
        nextAction: 'advance',
      }),
    )

    await store.reevaluateLastAttempt(slotId, quiz)

    const last = store.getAttempts(slotId)[0]!
    expect(last.score).toBe(0)
    expect(last.gaps).toContain('C')
  })

  it('re-evaluates sorting quiz deterministically', async () => {
    const store = useAttemptsStore.getState()
    const slotId = 'concept-1:slot-7'

    const quiz: Quiz = {
      id: slotId,
      conceptId: 'c1',
      ladderLevel: 2,
      expressionLevel: 2,
      interactionType: 'sorting',
      stem: 'order these',
      options: ['first', 'second', 'third'],
      answer: 'first\nsecond\nthird',
      explanation: 'e',
      distractors: [],
    }

    // User submitted correct order but was scored wrong
    store.addAttempt(
      makeAttempt(slotId, 0, {
        userAnswer: 'first\nsecond\nthird',
        score: 0,
        gaps: ['correct order: first -> second -> third'],
        nextAction: 'retry',
      }),
    )

    await store.reevaluateLastAttempt(slotId, quiz)

    const last = store.getAttempts(slotId)[0]!
    expect(last.score).toBe(100)
    expect(last.nextAction).toBe('advance')
    expect(last.gaps).toEqual([])
  })
})
