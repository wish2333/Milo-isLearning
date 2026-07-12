import { describe, it, expect, beforeEach } from 'vitest'
import { useAttemptsStore } from '../attempts-store'
import type { AttemptRecord } from '@/types/domain'

function makeAttempt(slotId: string, score: number): AttemptRecord {
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
