import { describe, expect, it } from 'vitest'

import type { AttemptRecord, Module, Quiz } from '@/types/domain'

import {
  buildAdaptiveQueue,
  collectReviewSlots,
  collectConfirmSlots,
  collectCarriedReviewSlots,
  findQuizInModule,
  PASS_THRESHOLD,
} from '../adaptive-sequencer'

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

function makeQuiz(id: string, conceptId: string): Quiz {
  return {
    id,
    conceptId,
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: `Q: ${id}`,
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: 'A is correct',
    distractors: ['B'],
  }
}

function makeModule(conceptCount: number, quizzesPerConcept: number): Module {
  const concepts = Array.from({ length: conceptCount }, (_, ci) => ({
    id: `concept-${ci}`,
    moduleId: 'module-1',
    name: `Concept ${ci}`,
    definition: 'def',
    type: 'fact' as const,
    keyPoints: [],
    quizSeries: {
      conceptId: `concept-${ci}`,
      quizzes: Array.from({ length: quizzesPerConcept }, (_, qi) =>
        makeQuiz(`concept-${ci}:slot-${qi}`, `concept-${ci}`),
      ),
    },
    order: ci,
  }))
  return {
    id: 'module-1',
    sourceId: 'src-1',
    title: 'Test Module',
    intro: 'intro',
    goal: 'goal',
    concepts,
    feynmanTask: {
      moduleId: 'module-1',
      steps: [],
      finalPrompt: 'explain',
      rubric: ['good'],
    },
    order: 1,
  }
}

describe('collectReviewSlots', () => {
  it('identifies slots with wrong attempts', () => {
    const testModule = makeModule(2, 3)
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [attempt('concept-0:slot-0', 30, 1)],
      'concept-0:slot-1': [attempt('concept-0:slot-1', 100, 1)],
      'concept-0:slot-2': [attempt('concept-0:slot-2', 100, 2)],
    }
    const result = collectReviewSlots(testModule, 0, attemptsBySlot)
    expect(result).toEqual(['concept-0:slot-0'])
  })

  it('identifies slots with guessed attempts', () => {
    const testModule = makeModule(1, 2)
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [{ ...attempt('concept-0:slot-0', 100, 1), guessed: true }],
      'concept-0:slot-1': [attempt('concept-0:slot-1', 100, 2)],
    }
    const result = collectReviewSlots(testModule, 0, attemptsBySlot)
    expect(result).toEqual(['concept-0:slot-0'])
  })

  it('returns empty array for concept with all correct', () => {
    const testModule = makeModule(1, 3)
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [attempt('concept-0:slot-0', 100, 1)],
      'concept-0:slot-1': [attempt('concept-0:slot-1', 90, 2)],
      'concept-0:slot-2': [attempt('concept-0:slot-2', PASS_THRESHOLD, 3)],
    }
    const result = collectReviewSlots(testModule, 0, attemptsBySlot)
    expect(result).toEqual([])
  })

  it('returns empty array for out-of-range conceptIndex', () => {
    const testModule = makeModule(1, 2)
    const result = collectReviewSlots(testModule, 5, {})
    expect(result).toEqual([])
  })
})

describe('collectConfirmSlots', () => {
  it('finds first-pass-correct non-guessed slots', () => {
    const testModule = makeModule(2, 3)
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [attempt('concept-0:slot-0', 100, 1)],
      'concept-0:slot-1': [attempt('concept-0:slot-1', 30, 1), attempt('concept-0:slot-1', 100, 2)],
      'concept-0:slot-2': [attempt('concept-0:slot-2', 100, 1)],
    }
    const result = collectConfirmSlots(testModule, 0, attemptsBySlot)
    expect(result).toEqual(['concept-0:slot-0', 'concept-0:slot-2'])
  })

  it('excludes guessed-correct slots', () => {
    const testModule = makeModule(1, 2)
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [{ ...attempt('concept-0:slot-0', 100, 1), guessed: true }],
      'concept-0:slot-1': [attempt('concept-0:slot-1', 100, 1)],
    }
    const result = collectConfirmSlots(testModule, 0, attemptsBySlot)
    expect(result).toEqual(['concept-0:slot-1'])
  })

  it('returns empty for conceptIndex < 0', () => {
    const testModule = makeModule(1, 2)
    const result = collectConfirmSlots(testModule, -1, {})
    expect(result).toEqual([])
  })

  it('returns empty for non-existent concept', () => {
    const testModule = makeModule(1, 2)
    const result = collectConfirmSlots(testModule, 5, {})
    expect(result).toEqual([])
  })
})

describe('collectCarriedReviewSlots', () => {
  it('carries forward unanswered review slots', () => {
    const carried = collectCarriedReviewSlots(['concept-0:slot-0', 'concept-0:slot-1'], {})
    expect(carried).toEqual(['concept-0:slot-0', 'concept-0:slot-1'])
  })

  it('carries forward wrong-answered review slots', () => {
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [attempt('concept-0:slot-0', 30, 1)],
      'concept-0:slot-1': [attempt('concept-0:slot-1', 100, 1)],
    }
    const carried = collectCarriedReviewSlots(
      ['concept-0:slot-0', 'concept-0:slot-1'],
      attemptsBySlot,
    )
    expect(carried).toEqual(['concept-0:slot-0'])
  })

  it('does not carry forward correct-answered review slots', () => {
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [attempt('concept-0:slot-0', 100, 1)],
      'concept-0:slot-1': [attempt('concept-0:slot-1', 100, 1)],
    }
    const carried = collectCarriedReviewSlots(
      ['concept-0:slot-0', 'concept-0:slot-1'],
      attemptsBySlot,
    )
    expect(carried).toEqual([])
  })

  it('returns empty for undefined reviewSlots', () => {
    const carried = collectCarriedReviewSlots(undefined, {})
    expect(carried).toEqual([])
  })

  it('returns empty for empty reviewSlots', () => {
    const carried = collectCarriedReviewSlots([], {})
    expect(carried).toEqual([])
  })

  it('提供 currentModule 时排除跨模块穿插 slot（V2.1.6 决策 #3）', () => {
    const mod = makeModule(2, 1)
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [attempt('concept-0:slot-0', 30, 1)],
      'cross-module-slot': [attempt('cross-module-slot', 30, 1)],
    }
    const carried = collectCarriedReviewSlots(
      ['concept-0:slot-0', 'cross-module-slot'],
      attemptsBySlot,
      mod,
    )
    expect(carried).toEqual(['concept-0:slot-0'])
  })

  it('未提供 currentModule 时保持旧行为（carry 全部 wrong slot）', () => {
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [attempt('concept-0:slot-0', 30, 1)],
      'cross-module-slot': [attempt('cross-module-slot', 30, 1)],
    }
    const carried = collectCarriedReviewSlots(
      ['concept-0:slot-0', 'cross-module-slot'],
      attemptsBySlot,
    )
    expect(carried).toEqual(['concept-0:slot-0', 'cross-module-slot'])
  })
})

describe('buildAdaptiveQueue — ignored quiz filtering', () => {
  it('excludes ignored quiz from queue', () => {
    const slots = makeSlots(3)
    slots[1]!.ignored = true
    const queue = buildAdaptiveQueue({
      slots,
      attempts: [],
      currentSlotId: 'concept-1:slot-1',
    })
    expect(queue.upcoming.map((s) => s.slotId)).not.toContain('concept-1:slot-2')
    expect(queue.next?.slotId).not.toBe('concept-1:slot-2')
  })

  it('returns null next and empty upcoming when all slots ignored', () => {
    const slots = makeSlots(3).map((s) => ({ ...s, ignored: true as const }))
    const queue = buildAdaptiveQueue({
      slots,
      attempts: [],
      currentSlotId: 'concept-1:slot-1',
    })
    expect(queue.next).toBeNull()
    expect(queue.upcoming).toHaveLength(0)
  })

  it('ignored wrong-answer quiz does not appear as revisit slot', () => {
    const slots = makeSlots(3)
    slots[1]!.ignored = true
    const queue = buildAdaptiveQueue({
      slots,
      attempts: [
        attempt('concept-1:slot-2', 0, 1),
        attempt('concept-1:slot-3', 100, 2),
        attempt('concept-1:slot-1', 100, 3),
      ],
      currentSlotId: 'concept-1:slot-3',
    })
    const slotIds = queue.upcoming.map((s) => s.slotId)
    expect(slotIds).not.toContain('concept-1:slot-2')
  })
})

describe('collectReviewSlots — ignored quiz filtering', () => {
  it('excludes ignored quiz from review slots', () => {
    const testModule = makeModule(1, 3)
    testModule.concepts[0]!.quizSeries.quizzes[1]!.ignored = true
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [attempt('concept-0:slot-0', 30, 1)],
      'concept-0:slot-1': [attempt('concept-0:slot-1', 30, 1)],
      'concept-0:slot-2': [attempt('concept-0:slot-2', 30, 1)],
    }
    const result = collectReviewSlots(testModule, 0, attemptsBySlot)
    expect(result).not.toContain('concept-0:slot-1')
    expect(result).toContain('concept-0:slot-0')
    expect(result).toContain('concept-0:slot-2')
  })
})

describe('collectConfirmSlots — ignored quiz filtering', () => {
  it('excludes ignored quiz from confirm slots', () => {
    const testModule = makeModule(1, 3)
    testModule.concepts[0]!.quizSeries.quizzes[1]!.ignored = true
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'concept-0:slot-0': [attempt('concept-0:slot-0', 100, 1)],
      'concept-0:slot-1': [attempt('concept-0:slot-1', 100, 1)],
      'concept-0:slot-2': [attempt('concept-0:slot-2', 100, 1)],
    }
    const result = collectConfirmSlots(testModule, 0, attemptsBySlot)
    expect(result).not.toContain('concept-0:slot-1')
    expect(result).toContain('concept-0:slot-0')
    expect(result).toContain('concept-0:slot-2')
  })
})

describe('findQuizInModule', () => {
  it('finds quiz in concepts', () => {
    const testModule = makeModule(2, 3)
    const quiz = findQuizInModule(testModule, 'concept-1:slot-2')
    expect(quiz).toBeDefined()
    expect(quiz!.id).toBe('concept-1:slot-2')
  })

  it('finds quiz in challenge quizzes', () => {
    const testModule = makeModule(1, 2)
    testModule.challengeQuizzes = [makeQuiz('challenge:slot-0', 'concept-0')]
    const quiz = findQuizInModule(testModule, 'challenge:slot-0')
    expect(quiz).toBeDefined()
    expect(quiz!.id).toBe('challenge:slot-0')
  })

  it('returns undefined for non-existent id', () => {
    const testModule = makeModule(1, 2)
    const quiz = findQuizInModule(testModule, 'non-existent')
    expect(quiz).toBeUndefined()
  })
})
