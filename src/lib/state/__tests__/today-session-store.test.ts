import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Quiz } from '@/types/domain'

const values = new Map<string, unknown>()

vi.mock('@/lib/persistence/client/storage', () => ({
  getStorage: () => ({
    get: <T>(key: string): T | null => (values.get(key) as T | undefined) ?? null,
    set: <T>(key: string, value: T) => values.set(key, value),
    remove: (key: string) => values.delete(key),
    has: (key: string) => values.has(key),
    keys: () => [...values.keys()],
    getRaw: () => null,
    setRaw: () => undefined,
    clearAll: () => values.clear(),
  }),
}))

import { StorageKeys } from '@/lib/persistence/shared/keys'
import { useTodaySessionStore } from '../today-session-store'

const quiz: Quiz = {
  id: 'quiz-1',
  conceptId: 'concept-1',
  ladderLevel: 1,
  expressionLevel: 1,
  interactionType: 'choice',
  stem: '问题',
  options: ['A', 'B'],
  answer: 'A',
  explanation: '解释',
  distractors: ['B'],
}

beforeEach(() => {
  values.clear()
  useTodaySessionStore.setState({ session: null })
})

describe('today-session-store', () => {
  it('persists a fixed due snapshot and can hydrate it', () => {
    const queue = [{ quiz, moduleId: 'module-1', slotId: quiz.id }]
    expect(useTodaySessionStore.getState().startSession(queue, '2026-07-17')).toBe(true)

    const session = useTodaySessionStore.getState().session
    expect(session?.date).toBe('2026-07-17')
    expect(session?.initialDueSnapshot).toEqual(['quiz-1'])
    expect(values.has(StorageKeys.todaySession)).toBe(true)

    useTodaySessionStore.setState({ session: null })
    expect(useTodaySessionStore.getState().hydrate()?.queue[0]?.slotId).toBe('quiz-1')
  })

  it('records one result and advances without changing the denominator', () => {
    const queue = [
      { quiz, moduleId: 'module-1', slotId: quiz.id },
      { quiz: { ...quiz, id: 'quiz-2' }, moduleId: 'module-1', slotId: 'quiz-2' },
    ]
    useTodaySessionStore.getState().startSession(queue, '2026-07-17')
    useTodaySessionStore.getState().recordResult('quiz-1', 100)
    useTodaySessionStore.getState().nextQuestion()

    const session = useTodaySessionStore.getState().session!
    expect(session.initialDueSnapshot).toHaveLength(2)
    expect(session.results).toEqual([{ slotId: 'quiz-1', score: 100, passed: true }])
    expect(session.currentIndex).toBe(1)
  })

  it('updates an existing result after a corrected answer is re-evaluated', () => {
    useTodaySessionStore
      .getState()
      .startSession([{ quiz, moduleId: 'module-1', slotId: quiz.id }], '2026-07-17')
    useTodaySessionStore.getState().recordResult('quiz-1', 0)
    useTodaySessionStore.getState().updateResult('quiz-1', 100)

    expect(useTodaySessionStore.getState().session?.results).toEqual([
      { slotId: 'quiz-1', score: 100, passed: true },
    ])
  })

  it('rejects an empty queue', () => {
    expect(useTodaySessionStore.getState().startSession([], '2026-07-17')).toBe(false)
    expect(useTodaySessionStore.getState().session).toBeNull()
  })
})
