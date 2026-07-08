// retry-policy.test.ts — 连续失败追踪与强制推进单测
//
// 覆盖：
//   - getConsecutiveFailures: 空/1/2/3+/中间 advance 断开/乱序 timestamp
//   - shouldForceAdvance: 阈值边界（2 次 vs 3 次）
//   - isSlotCompleted: 通过/强制推进/未完成

import { describe, expect, it } from 'vitest'

import type { AttemptRecord } from '@/types/domain'

import {
  MAX_CONSECUTIVE_FAILURES,
  getConsecutiveFailures,
  isSlotCompleted,
  shouldForceAdvance,
} from '../retry-policy'

// =================================================================
// 测试夹具
// =================================================================

let tsCounter = 1000

function makeAttempt(
  partial: Partial<AttemptRecord> & Pick<AttemptRecord, 'nextAction'>,
): AttemptRecord {
  tsCounter++
  const { nextAction, ...rest } = partial
  return {
    id: `att-${tsCounter}`,
    quizId: 'concept-1:0',
    originalQuizId: 'concept-1:0',
    attemptVersion: 0,
    userAnswer: 'dummy',
    score: nextAction === 'advance' ? 100 : 0,
    gaps: [],
    nextAction,
    timestamp: tsCounter,
    ...rest,
  }
}

// =================================================================
// getConsecutiveFailures
// =================================================================

describe('getConsecutiveFailures', () => {
  it('returns 0 for empty array', () => {
    expect(getConsecutiveFailures([])).toBe(0)
  })

  it('returns 0 when last attempt is advance', () => {
    const attempts = [makeAttempt({ nextAction: 'retry' }), makeAttempt({ nextAction: 'advance' })]
    expect(getConsecutiveFailures(attempts)).toBe(0)
  })

  it('returns 1 for single retry', () => {
    const attempts = [makeAttempt({ nextAction: 'retry' })]
    expect(getConsecutiveFailures(attempts)).toBe(1)
  })

  it('returns 2 for two consecutive retries', () => {
    const attempts = [
      makeAttempt({ nextAction: 'advance' }),
      makeAttempt({ nextAction: 'retry', attemptVersion: 0 }),
      makeAttempt({ nextAction: 'retry', attemptVersion: 1 }),
    ]
    expect(getConsecutiveFailures(attempts)).toBe(2)
  })

  it('returns 3 for three consecutive retries', () => {
    const attempts = [
      makeAttempt({ nextAction: 'retry', attemptVersion: 0 }),
      makeAttempt({ nextAction: 'retry', attemptVersion: 1 }),
      makeAttempt({ nextAction: 'retry', attemptVersion: 2 }),
    ]
    expect(getConsecutiveFailures(attempts)).toBe(3)
  })

  it('stops counting at first advance from end', () => {
    const attempts = [
      makeAttempt({ nextAction: 'retry' }),
      makeAttempt({ nextAction: 'advance' }),
      makeAttempt({ nextAction: 'retry' }),
      makeAttempt({ nextAction: 'retry' }),
    ]
    expect(getConsecutiveFailures(attempts)).toBe(2)
  })

  it('handles unsorted timestamps correctly', () => {
    // 故意打乱顺序
    const t3 = makeAttempt({ nextAction: 'retry' })
    const t1 = makeAttempt({ nextAction: 'retry' })
    const t2 = makeAttempt({ nextAction: 'advance' })
    t1.timestamp = 1000
    t2.timestamp = 2000
    t3.timestamp = 3000
    const attempts = [t3, t1, t2] // 乱序
    // 排序后: retry(t1@1000) → advance(t2@2000) → retry(t3@3000)
    // 从末尾数: 1 次 retry
    expect(getConsecutiveFailures(attempts)).toBe(1)
  })
})

// =================================================================
// shouldForceAdvance
// =================================================================

describe('shouldForceAdvance', () => {
  it('returns false for 0 consecutive failures', () => {
    expect(shouldForceAdvance([])).toBe(false)
  })

  it('returns false for 1 consecutive failure', () => {
    const attempts = [makeAttempt({ nextAction: 'retry' })]
    expect(shouldForceAdvance(attempts)).toBe(false)
  })

  it('returns false for 2 consecutive failures (one below threshold)', () => {
    const attempts = [
      makeAttempt({ nextAction: 'retry', attemptVersion: 0 }),
      makeAttempt({ nextAction: 'retry', attemptVersion: 1 }),
    ]
    expect(shouldForceAdvance(attempts)).toBe(false)
  })

  it('returns true at MAX_CONSECUTIVE_FAILURES', () => {
    const attempts = Array.from({ length: MAX_CONSECUTIVE_FAILURES }, (_, i) =>
      makeAttempt({ nextAction: 'retry', attemptVersion: i }),
    )
    expect(shouldForceAdvance(attempts)).toBe(true)
  })

  it('returns true for more than MAX_CONSECUTIVE_FAILURES', () => {
    const attempts = Array.from({ length: 5 }, (_, i) =>
      makeAttempt({ nextAction: 'retry', attemptVersion: i }),
    )
    expect(shouldForceAdvance(attempts)).toBe(true)
  })
})

// =================================================================
// isSlotCompleted
// =================================================================

describe('isSlotCompleted', () => {
  it('returns false for empty attempts', () => {
    expect(isSlotCompleted([])).toBe(false)
  })

  it('returns true when any attempt has advance', () => {
    const attempts = [
      makeAttempt({ nextAction: 'retry', attemptVersion: 0 }),
      makeAttempt({ nextAction: 'advance', attemptVersion: 1 }),
    ]
    expect(isSlotCompleted(attempts)).toBe(true)
  })

  it('returns false when all attempts are retry but below threshold', () => {
    const attempts = [
      makeAttempt({ nextAction: 'retry', attemptVersion: 0 }),
      makeAttempt({ nextAction: 'retry', attemptVersion: 1 }),
    ]
    expect(isSlotCompleted(attempts)).toBe(false)
  })

  it('returns true when force-advance threshold reached', () => {
    const attempts = Array.from({ length: MAX_CONSECUTIVE_FAILURES }, (_, i) =>
      makeAttempt({ nextAction: 'retry', attemptVersion: i }),
    )
    expect(isSlotCompleted(attempts)).toBe(true)
  })
})
