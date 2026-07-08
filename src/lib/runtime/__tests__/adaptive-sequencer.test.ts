import { describe, expect, it } from 'vitest'

import type { AttemptRecord, Quiz } from '@/types/domain'

import { buildAdaptiveQueue } from '../adaptive-sequencer'

function makeSlots(count: number): Quiz[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `concept-1:slot-${index + 1}`,
    conceptId: 'concept-1',
    ladderLevel: index < 2 ? 1 : 2,
    expressionLevel: index >= 4 ? 3 : 1,
    interactionType: index >= 4 ? 'fill_blank' : 'choice',
    stem: `Q${index + 1}`,
    options: index >= 4 ? null : ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: 'A is correct because it matches the concept and the distractors do not.',
    distractors: ['B'],
  }))
}

function attempt(slotId: string, score: number, timestamp: number): AttemptRecord {
  return {
    id: `att-${slotId}-${timestamp}`,
    quizId: slotId,
    originalQuizId: slotId,
    attemptVersion: 0,
    userAnswer: 'B',
    score,
    gaps: score >= 80 ? [] : ['gap'],
    nextAction: score >= 80 ? 'advance' : 'retry',
    timestamp,
  }
}

describe('buildAdaptiveQueue', () => {
  it('schedules a missed slot after two unseen slots instead of immediate regeneration', () => {
    const queue = buildAdaptiveQueue({
      slots: makeSlots(10),
      attempts: [attempt('concept-1:slot-2', 0, 1)],
      currentSlotId: 'concept-1:slot-2',
    })

    expect(queue.upcoming.slice(0, 3).map((slot) => slot.slotId)).toEqual([
      'concept-1:slot-3',
      'concept-1:slot-4',
      'concept-1:slot-2',
    ])
    expect(queue.next?.slotId).toBe('concept-1:slot-3')
    expect(queue.rationale).toContain('两题后')
  })

  it('returns the missed slot after two newer unseen slots have been answered', () => {
    const queue = buildAdaptiveQueue({
      slots: makeSlots(10),
      attempts: [
        attempt('concept-1:slot-2', 0, 1),
        attempt('concept-1:slot-3', 100, 2),
        attempt('concept-1:slot-4', 100, 3),
      ],
      currentSlotId: 'concept-1:slot-4',
    })

    expect(queue.next?.slotId).toBe('concept-1:slot-2')
  })

  it('prefers lower expression pressure after two consecutive misses in the same concept', () => {
    const queue = buildAdaptiveQueue({
      slots: makeSlots(6),
      attempts: [attempt('concept-1:slot-4', 0, 1), attempt('concept-1:slot-5', 0, 2)],
      currentSlotId: 'concept-1:slot-5',
    })

    expect(queue.next?.interactionType).toBe('choice')
  })

  it('does not repeat mastered slots when unseen slots remain', () => {
    const queue = buildAdaptiveQueue({
      slots: makeSlots(4),
      attempts: [attempt('concept-1:slot-1', 100, 1)],
      currentSlotId: 'concept-1:slot-1',
    })

    expect(queue.upcoming.map((slot) => slot.slotId)).toEqual([
      'concept-1:slot-2',
      'concept-1:slot-3',
      'concept-1:slot-4',
    ])
  })
})
