import { describe, it, expect } from 'vitest'
import { computeLearningTime } from '../learning-time'
import type { AttemptRecord } from '@/types/domain'

function makeAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: 'test-id',
    quizId: 'quiz-1',
    originalQuizId: 'quiz-1',
    attemptVersion: 0,
    userAnswer: 'A',
    score: 100,
    gaps: [],
    nextAction: 'advance',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('computeLearningTime', () => {
  it('returns zero values for empty input', () => {
    const result = computeLearningTime([])
    expect(result.totalSeconds).toBe(0)
    expect(result.avgSeconds).toBe(0)
    expect(result.hasTimeData).toBe(false)
    expect(result.formattedTotal).toBe('0 秒')
    expect(result.formattedAvg).toBe('0 秒')
  })

  it('ignores attempts without answeredAt (old data)', () => {
    const attempts = [makeAttempt(), makeAttempt()]
    const result = computeLearningTime(attempts)
    expect(result.hasTimeData).toBe(false)
    expect(result.totalSeconds).toBe(0)
  })

  it('sums timeSpentMs from attempts with answeredAt', () => {
    const attempts = [
      makeAttempt({ answeredAt: 1000, timeSpentMs: 15000 }),
      makeAttempt({ answeredAt: 2000, timeSpentMs: 25000 }),
    ]
    const result = computeLearningTime(attempts)
    expect(result.hasTimeData).toBe(true)
    expect(result.totalSeconds).toBe(40)
    expect(result.avgSeconds).toBe(20)
  })

  it('formats seconds under 60 correctly', () => {
    const attempts = [makeAttempt({ answeredAt: 1000, timeSpentMs: 45000 })]
    const result = computeLearningTime(attempts)
    expect(result.formattedTotal).toBe('45 秒')
    expect(result.formattedAvg).toBe('45 秒')
  })

  it('formats seconds over 60 as minutes and seconds', () => {
    const attempts = [makeAttempt({ answeredAt: 1000, timeSpentMs: 150000 })]
    const result = computeLearningTime(attempts)
    expect(result.formattedTotal).toBe('2 分 30 秒')
    expect(result.formattedAvg).toBe('2 分 30 秒')
  })

  it('computes average correctly across multiple attempts', () => {
    const attempts = [
      makeAttempt({ answeredAt: 1000, timeSpentMs: 30000 }),
      makeAttempt({ answeredAt: 2000, timeSpentMs: 60000 }),
      makeAttempt({ answeredAt: 3000, timeSpentMs: 90000 }),
    ]
    const result = computeLearningTime(attempts)
    expect(result.totalSeconds).toBe(180)
    expect(result.avgSeconds).toBe(60)
    expect(result.formattedTotal).toBe('3 分 0 秒')
    expect(result.formattedAvg).toBe('1 分 0 秒')
  })

  it('handles mix of timed and untimed attempts', () => {
    const attempts = [
      makeAttempt({ answeredAt: undefined, timeSpentMs: undefined }),
      makeAttempt({ answeredAt: 1000, timeSpentMs: 10000 }),
    ]
    const result = computeLearningTime(attempts)
    expect(result.hasTimeData).toBe(true)
    expect(result.totalSeconds).toBe(10)
    expect(result.avgSeconds).toBe(10)
  })

  it('handles missing timeSpentMs by treating as 0', () => {
    const attempts = [makeAttempt({ answeredAt: 1000, timeSpentMs: undefined })]
    const result = computeLearningTime(attempts)
    expect(result.hasTimeData).toBe(true)
    expect(result.totalSeconds).toBe(0)
    expect(result.formattedTotal).toBe('0 秒')
  })
})
