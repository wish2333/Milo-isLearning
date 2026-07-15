import { describe, it, expect, beforeEach } from 'vitest'
import { useAttemptsStore } from '../attempts-store'
import type { AttemptRecord } from '@/types/domain'

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
