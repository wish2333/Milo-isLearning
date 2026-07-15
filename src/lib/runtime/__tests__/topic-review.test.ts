// topic-review.test.ts — matchesFilter / collectReviewItemsForModules 纯函数单测
//
// 覆盖：
//   - matchesFilter: wrong only, guessed only, both, neither, empty, undefined
//   - collectReviewItemsForModules: single module, filter variants, multi-module,
//     challengeQuizzes, quiz with no attempts

import { describe, expect, it } from 'vitest'

import type { AttemptRecord, Module, Quiz } from '@/types/domain'

import { collectReviewItemsForModules, matchesFilter } from '../topic-review'

// =================================================================
// 测试夹具
// =================================================================

function makeAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: `att-${Math.random().toString(36).slice(2)}`,
    quizId: 'quiz-1',
    originalQuizId: 'quiz-1',
    attemptVersion: 1,
    userAnswer: 'A',
    score: 100,
    gaps: [],
    nextAction: 'advance' as const,
    timestamp: Date.now(),
    ...overrides,
  }
}

function makeQuiz(id: string): Quiz {
  return {
    id,
    conceptId: 'concept-1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: `题目 ${id}`,
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: '解析',
    distractors: ['B', 'C', 'D'],
    misconception: '常见错误',
    extendedKnowledge: '拓展',
  }
}

function makeModule(moduleId: string, quizIds: string[]): Module {
  const quizzes = quizIds.map((id) => makeQuiz(id))
  return {
    id: moduleId,
    sourceId: `src-${moduleId}`,
    title: `模块 ${moduleId}`,
    intro: '',
    goal: '',
    concepts: [
      {
        id: 'concept-1',
        moduleId,
        name: '概念1',
        definition: '摘要',
        type: 'fact' as const,
        keyPoints: [],
        quizSeries: { conceptId: 'concept-1', quizzes },
        order: 0,
      },
    ],
    feynmanTask: {
      moduleId,
      steps: [],
      finalPrompt: '',
      rubric: [],
    },
    order: 0,
  }
}

function makeModuleWithChallenge(
  moduleId: string,
  conceptQuizIds: string[],
  challengeQuizIds: string[],
): Module {
  return {
    ...makeModule(moduleId, conceptQuizIds),
    challengeQuizzes: challengeQuizIds.map((id) => makeQuiz(id)),
  }
}

// =================================================================
// matchesFilter
// =================================================================

describe('matchesFilter', () => {
  it('wrong only (score < 80, no guessed) → wrong=true, guessed=false, all=true', () => {
    const attempts = [makeAttempt({ score: 50, guessed: false })]
    expect(matchesFilter(attempts, 'wrong')).toBe(true)
    expect(matchesFilter(attempts, 'guessed')).toBe(false)
    expect(matchesFilter(attempts, 'all')).toBe(true)
  })

  it('guessed only (score >= 80, guessed=true) → guessed=true, wrong=false, all=true', () => {
    const attempts = [makeAttempt({ score: 100, guessed: true })]
    expect(matchesFilter(attempts, 'guessed')).toBe(true)
    expect(matchesFilter(attempts, 'wrong')).toBe(false)
    expect(matchesFilter(attempts, 'all')).toBe(true)
  })

  it('both wrong and guessed → all three filters true', () => {
    const attempts = [makeAttempt({ score: 50, guessed: true })]
    expect(matchesFilter(attempts, 'wrong')).toBe(true)
    expect(matchesFilter(attempts, 'guessed')).toBe(true)
    expect(matchesFilter(attempts, 'all')).toBe(true)
  })

  it('neither (all correct, no guessed) → all filters false', () => {
    const attempts = [makeAttempt({ score: 100, guessed: false })]
    expect(matchesFilter(attempts, 'wrong')).toBe(false)
    expect(matchesFilter(attempts, 'guessed')).toBe(false)
    expect(matchesFilter(attempts, 'all')).toBe(false)
  })

  it('empty attempts → all filters false', () => {
    expect(matchesFilter([], 'wrong')).toBe(false)
    expect(matchesFilter([], 'guessed')).toBe(false)
    expect(matchesFilter([], 'all')).toBe(false)
  })

  it('undefined attempts → all filters false', () => {
    expect(matchesFilter(undefined, 'wrong')).toBe(false)
    expect(matchesFilter(undefined, 'guessed')).toBe(false)
    expect(matchesFilter(undefined, 'all')).toBe(false)
  })

  it('multiple attempts: at least one wrong → wrong=true', () => {
    const attempts = [
      makeAttempt({ score: 100, guessed: false }),
      makeAttempt({ score: 60, guessed: false }),
    ]
    expect(matchesFilter(attempts, 'wrong')).toBe(true)
    expect(matchesFilter(attempts, 'guessed')).toBe(false)
  })

  it('multiple attempts: at least one guessed → guessed=true', () => {
    const attempts = [
      makeAttempt({ score: 100, guessed: false }),
      makeAttempt({ score: 100, guessed: true }),
    ]
    expect(matchesFilter(attempts, 'guessed')).toBe(true)
    expect(matchesFilter(attempts, 'wrong')).toBe(false)
  })
})

// =================================================================
// collectReviewItemsForModules
// =================================================================

describe('collectReviewItemsForModules', () => {
  it('single module, mixed wrong/guessed, filter=all → collects all', () => {
    const mod = makeModule('mod-1', ['q1', 'q2'])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ quizId: 'q1', score: 50, guessed: false })],
      q2: [makeAttempt({ quizId: 'q2', score: 100, guessed: true })],
    }

    const items = collectReviewItemsForModules([mod], attemptsBySlot, 'all')
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.slotId)).toEqual(['q1', 'q2'])
  })

  it('filter=wrong → only wrong quizzes', () => {
    const mod = makeModule('mod-1', ['q1', 'q2'])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ quizId: 'q1', score: 50, guessed: false })],
      q2: [makeAttempt({ quizId: 'q2', score: 100, guessed: true })],
    }

    const items = collectReviewItemsForModules([mod], attemptsBySlot, 'wrong')
    expect(items).toHaveLength(1)
    expect(items[0]!.slotId).toBe('q1')
  })

  it('filter=guessed → only guessed quizzes', () => {
    const mod = makeModule('mod-1', ['q1', 'q2'])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ quizId: 'q1', score: 50, guessed: false })],
      q2: [makeAttempt({ quizId: 'q2', score: 100, guessed: true })],
    }

    const items = collectReviewItemsForModules([mod], attemptsBySlot, 'guessed')
    expect(items).toHaveLength(1)
    expect(items[0]!.slotId).toBe('q2')
  })

  it('multiple modules → merges items from all', () => {
    const mod1 = makeModule('mod-1', ['q1'])
    const mod2 = makeModule('mod-2', ['q2'])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ quizId: 'q1', score: 50, guessed: false })],
      q2: [makeAttempt({ quizId: 'q2', score: 100, guessed: true })],
    }

    const items = collectReviewItemsForModules([mod1, mod2], attemptsBySlot, 'all')
    expect(items).toHaveLength(2)
    expect(items[0]!.moduleId).toBe('mod-1')
    expect(items[1]!.moduleId).toBe('mod-2')
  })

  it('module with challengeQuizzes → those are included', () => {
    const mod = makeModuleWithChallenge('mod-1', ['q1'], ['cq1'])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ quizId: 'q1', score: 50, guessed: false })],
      cq1: [makeAttempt({ quizId: 'cq1', score: 60, guessed: false })],
    }

    const items = collectReviewItemsForModules([mod], attemptsBySlot, 'all')
    expect(items).toHaveLength(2)
    const slotIds = items.map((i) => i.slotId)
    expect(slotIds).toContain('q1')
    expect(slotIds).toContain('cq1')
  })

  it('quiz with no attempts → skipped', () => {
    const mod = makeModule('mod-1', ['q1', 'q2'])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ quizId: 'q1', score: 50, guessed: false })],
    }

    const items = collectReviewItemsForModules([mod], attemptsBySlot, 'all')
    expect(items).toHaveLength(1)
    expect(items[0]!.slotId).toBe('q1')
  })

  it('no matching items → empty array', () => {
    const mod = makeModule('mod-1', ['q1'])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ quizId: 'q1', score: 100, guessed: false })],
    }

    const items = collectReviewItemsForModules([mod], attemptsBySlot, 'wrong')
    expect(items).toHaveLength(0)
  })

  it('empty modules list → empty array', () => {
    const items = collectReviewItemsForModules([], {}, 'all')
    expect(items).toHaveLength(0)
  })

  it('excludes ignored concept quizzes from review items', () => {
    const mod = makeModule('mod-1', ['q1', 'q2', 'q3'])
    ;(mod.concepts[0]!.quizSeries.quizzes[1] as Quiz).ignored = true
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ quizId: 'q1', score: 50, guessed: false })],
      q2: [makeAttempt({ quizId: 'q2', score: 50, guessed: false })],
      q3: [makeAttempt({ quizId: 'q3', score: 50, guessed: false })],
    }
    const items = collectReviewItemsForModules([mod], attemptsBySlot, 'wrong')
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.slotId)).not.toContain('q2')
  })

  it('excludes ignored challenge quizzes from review items', () => {
    const mod = makeModuleWithChallenge('mod-1', ['q1'], ['cq1', 'cq2'])
    ;(mod.challengeQuizzes![1] as Quiz).ignored = true
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ quizId: 'q1', score: 50, guessed: false })],
      cq1: [makeAttempt({ quizId: 'cq1', score: 60, guessed: false })],
      cq2: [makeAttempt({ quizId: 'cq2', score: 60, guessed: false })],
    }
    const items = collectReviewItemsForModules([mod], attemptsBySlot, 'wrong')
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.slotId)).not.toContain('cq2')
  })

  it('ignored quiz that is a wrong answer does not appear in review queue', () => {
    const mod = makeModule('mod-1', ['q1', 'q2'])
    ;(mod.concepts[0]!.quizSeries.quizzes[0] as Quiz).ignored = true
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ quizId: 'q1', score: 30, guessed: false })],
      q2: [makeAttempt({ quizId: 'q2', score: 100, guessed: true })],
    }
    const items = collectReviewItemsForModules([mod], attemptsBySlot, 'all')
    expect(items).toHaveLength(1)
    expect(items[0]!.slotId).toBe('q2')
  })
})
