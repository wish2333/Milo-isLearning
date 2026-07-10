// mastery.test.ts — computeMastery 纯函数单测
//
// 覆盖边界值：
//   - 空 attempts（moduleCompletion=0, conceptMastery 全 0）
//   - 全对（conceptMastery=100, moduleCompletion 取决于 feynman）
//   - 全错（conceptMastery=0, moduleCompletion 取决于是否 force-advance）
//   - 部分重试（首次答对率 != 完成率）
//   - feynmanAttempt 缺失 vs 已提交

import { describe, expect, it } from 'vitest'

import type { AttemptRecord, FeynmanAttempt, Module } from '@/types/domain'

import { computeMastery } from '../mastery'

// =================================================================
// 测试夹具
// =================================================================

let idCounter = 0
const nextId = () => `att-${++idCounter}`

function makeModule(quizCountPerConcept = 2, conceptCount = 2): Module {
  const concepts = Array.from({ length: conceptCount }, (_, ci) => {
    const conceptId = `concept-${ci + 1}`
    const quizzes = Array.from({ length: quizCountPerConcept }, (_, qi) => ({
      id: `${conceptId}:${qi}`,
      conceptId,
      ladderLevel: 1 as const,
      expressionLevel: 1 as const,
      interactionType: 'choice' as const,
      stem: `Q${qi + 1}`,
      options: ['A', 'B', 'C', 'D'],
      answer: 'A',
      explanation: 'because A',
      distractors: ['B', 'C', 'D'],
    }))
    return {
      id: conceptId,
      moduleId: 'module-1',
      name: `Concept ${ci + 1}`,
      definition: 'def',
      type: 'fact' as const,
      keyPoints: ['point'],
      quizSeries: { conceptId, quizzes },
      order: ci + 1,
    }
  })

  return {
    id: 'module-1',
    sourceId: 'source-1',
    title: 'Test Module',
    intro: 'intro',
    goal: 'goal',
    concepts,
    feynmanTask: {
      moduleId: 'module-1',
      steps: Array.from({ length: 6 }, (_, i) => ({
        order: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6,
        type: i < 4 ? ('choice' as const) : ('fill_blank' as const),
        stem: `Step ${i + 1}`,
        options: i < 4 ? ['A', 'B', 'C', 'D'] : null,
        answer: 'A',
        explanation: 'exp',
      })),
      finalPrompt: 'Explain everything',
      rubric: ['point 1', 'point 2', 'point 3'],
    },
    order: 1,
  }
}

function makeAttempt(
  slotId: string,
  attemptVersion: number,
  score: number,
  nextAction: 'advance' | 'retry',
): AttemptRecord {
  return {
    id: nextId(),
    quizId: slotId,
    originalQuizId: slotId,
    attemptVersion,
    userAnswer: 'A',
    score,
    gaps: score >= 80 ? [] : ['gap'],
    nextAction,
    timestamp: Date.now() + idCounter,
  }
}

const FEYNMAN_ATTEMPT: FeynmanAttempt = {
  moduleId: 'module-1',
  stepResults: [
    { stepOrder: 1, score: 100 },
    { stepOrder: 2, score: 100 },
    { stepOrder: 3, score: 100 },
    { stepOrder: 4, score: 100 },
    { stepOrder: 5, score: 100 },
    { stepOrder: 6, score: 100 },
  ],
  finalOutput: 'sample output text '.repeat(10),
  finalScore: 80,
  finalGaps: [],
  submittedAt: Date.now(),
}

// =================================================================
// computeMastery
// =================================================================

describe('computeMastery', () => {
  it('returns 0 completion for empty attempts', () => {
    const mod = makeModule()
    const mastery = computeMastery(mod, {})

    expect(mastery.moduleId).toBe('module-1')
    expect(mastery.moduleCompletion).toBe(0)
    expect(mastery.conceptMastery).toHaveLength(2)
    expect(mastery.conceptMastery[0]?.mastery).toBe(0)
    expect(mastery.feynmanCompleted).toBe(false)
    expect(mastery.feynmanScore).toBeUndefined()
  })

  it('returns 100 conceptMastery when all first attempts pass', () => {
    const mod = makeModule(2, 2)
    const attempts: Record<string, AttemptRecord[]> = {
      'concept-1:0': [makeAttempt('concept-1:0', 0, 100, 'advance')],
      'concept-1:1': [makeAttempt('concept-1:1', 0, 100, 'advance')],
      'concept-2:0': [makeAttempt('concept-2:0', 0, 100, 'advance')],
      'concept-2:1': [makeAttempt('concept-2:1', 0, 100, 'advance')],
    }

    const mastery = computeMastery(mod, attempts)

    expect(mastery.conceptMastery[0]?.mastery).toBe(100)
    expect(mastery.conceptMastery[1]?.mastery).toBe(100)
    // 4 concept quizzes completed, 0 feynman → 4/10 = 40%
    expect(mastery.moduleCompletion).toBe(40)
  })

  it('counts retried-then-passed slot as NOT first-attempt mastery', () => {
    const mod = makeModule(2, 1)
    const attempts: Record<string, AttemptRecord[]> = {
      'concept-1:0': [
        makeAttempt('concept-1:0', 0, 0, 'retry'), // 首次答错
        makeAttempt('concept-1:0', 1, 100, 'advance'), // 重试答对
      ],
      'concept-1:1': [makeAttempt('concept-1:1', 0, 100, 'advance')],
    }

    const mastery = computeMastery(mod, attempts)

    // concept-1: 1/2 首次答对 = 50%
    expect(mastery.conceptMastery[0]?.mastery).toBe(50)
    // 2 slots completed (both advanced) → 2/8 = 25%
    expect(mastery.moduleCompletion).toBe(25)
  })

  it('counts force-advanced slots as completed but not first-attempt mastery', () => {
    const mod = makeModule(1, 1)
    const attempts: Record<string, AttemptRecord[]> = {
      'concept-1:0': [
        makeAttempt('concept-1:0', 0, 0, 'retry'),
        makeAttempt('concept-1:0', 1, 0, 'retry'),
        makeAttempt('concept-1:0', 2, 0, 'retry'), // 3 consecutive → force advance
      ],
    }

    const mastery = computeMastery(mod, attempts)

    // 首次答对率 = 0 (首次 score=0)
    expect(mastery.conceptMastery[0]?.mastery).toBe(0)
    // But slot is completed via force-advance → 1/7 = ~14%
    expect(mastery.moduleCompletion).toBe(14)
  })

  it('includes feynman steps in moduleCompletion when feynmanAttempt provided', () => {
    const mod = makeModule(2, 2)
    const attempts: Record<string, AttemptRecord[]> = {
      'concept-1:0': [makeAttempt('concept-1:0', 0, 100, 'advance')],
      'concept-1:1': [makeAttempt('concept-1:1', 0, 100, 'advance')],
      'concept-2:0': [makeAttempt('concept-2:0', 0, 100, 'advance')],
      'concept-2:1': [makeAttempt('concept-2:1', 0, 100, 'advance')],
    }

    const mastery = computeMastery(mod, attempts, FEYNMAN_ATTEMPT)

    // 4 concepts + 6 feynman = 10 completed → 100%
    expect(mastery.moduleCompletion).toBe(100)
    expect(mastery.feynmanCompleted).toBe(true)
    expect(mastery.feynmanScore).toBe(80)
  })

  it('handles partial feynman submission (no finalScore)', () => {
    const mod = makeModule(1, 1)
    const partialFeynman: FeynmanAttempt = {
      moduleId: 'module-1',
      stepResults: [{ stepOrder: 1, score: 100 }],
      submittedAt: Date.now(),
      // finalOutput/finalScore/finalGaps 缺失
    }

    const mastery = computeMastery(mod, {}, partialFeynman)

    // 1 feynman step done → 1/7 = ~14%
    expect(mastery.moduleCompletion).toBe(14)
    expect(mastery.feynmanCompleted).toBe(false)
    expect(mastery.feynmanScore).toBeUndefined()
  })

  it('handles moduleData with zero quizzes gracefully', () => {
    const mod = makeModule(0, 2)
    const mastery = computeMastery(mod, {}, FEYNMAN_ATTEMPT)

    // 0 concept quizzes + 6 feynman = 6 total, 6 done → 100%
    expect(mastery.moduleCompletion).toBe(100)
  })

  it('does not double-count slots with multiple attempts', () => {
    const mod = makeModule(1, 1)
    const attempts: Record<string, AttemptRecord[]> = {
      'concept-1:0': [
        makeAttempt('concept-1:0', 0, 0, 'retry'),
        makeAttempt('concept-1:0', 1, 100, 'advance'),
      ],
    }

    const mastery = computeMastery(mod, attempts)

    // 1 slot completed (not 2 attempts) → 1/7 = ~14%
    expect(mastery.moduleCompletion).toBe(14)
  })

  it('conceptMastery includes guessed-correct, conceptMasteryExcludingGuessed excludes it', () => {
    const mod = makeModule(2, 1)
    const attempts: Record<string, AttemptRecord[]> = {
      'concept-1:0': [{ ...makeAttempt('concept-1:0', 0, 100, 'advance'), guessed: true }],
      'concept-1:1': [makeAttempt('concept-1:1', 0, 100, 'advance')],
    }

    const mastery = computeMastery(mod, attempts)

    // conceptMastery: 2/2 first-attempt passed (includes guessed) = 100%
    expect(mastery.conceptMastery[0]?.mastery).toBe(100)
    // conceptMasteryExcludingGuessed: 1/2 passed (excludes guessed) = 50%
    expect(mastery.conceptMasteryExcludingGuessed?.[0]?.mastery).toBe(50)
  })

  it('conceptMasteryExcludingGuessed is lower when guesses are present', () => {
    const mod = makeModule(2, 1)
    const attemptsWithoutGuessed: Record<string, AttemptRecord[]> = {
      'concept-1:0': [makeAttempt('concept-1:0', 0, 100, 'advance')],
      'concept-1:1': [makeAttempt('concept-1:1', 0, 100, 'advance')],
    }
    const attemptsWithGuessed: Record<string, AttemptRecord[]> = {
      'concept-1:0': [{ ...makeAttempt('concept-1:0', 0, 100, 'advance'), guessed: true }],
      'concept-1:1': [makeAttempt('concept-1:1', 0, 100, 'advance')],
    }

    const masteryWithout = computeMastery(mod, attemptsWithoutGuessed)
    const masteryWith = computeMastery(mod, attemptsWithGuessed)

    // conceptMastery includes guessed — both should be 100
    expect(masteryWithout.conceptMastery[0]?.mastery).toBe(100)
    expect(masteryWith.conceptMastery[0]?.mastery).toBe(100)
    // conceptMasteryExcludingGuessed excludes guessed — should differ
    expect(masteryWithout.conceptMasteryExcludingGuessed?.[0]?.mastery).toBe(100)
    expect(masteryWith.conceptMasteryExcludingGuessed?.[0]?.mastery).toBe(50)
  })

  it('excludes guessed-correct from challenge mastery calculation', () => {
    const mod = makeModule(0, 0)
    mod.challengeQuizzes = [
      {
        id: 'challenge-0',
        conceptId: 'challenge',
        ladderLevel: 1,
        expressionLevel: 1,
        interactionType: 'choice',
        stem: 'C1',
        options: ['A', 'B', 'C', 'D'],
        answer: 'A',
        explanation: 'exp',
        distractors: ['B', 'C', 'D'],
      },
      {
        id: 'challenge-1',
        conceptId: 'challenge',
        ladderLevel: 2,
        expressionLevel: 2,
        interactionType: 'choice',
        stem: 'C2',
        options: ['A', 'B', 'C', 'D'],
        answer: 'A',
        explanation: 'exp',
        distractors: ['B', 'C', 'D'],
      },
    ]
    const attempts: Record<string, AttemptRecord[]> = {
      'challenge-0': [{ ...makeAttempt('challenge-0', 0, 100, 'advance'), guessed: true }],
      'challenge-1': [makeAttempt('challenge-1', 0, 100, 'advance')],
    }

    const mastery = computeMastery(mod, attempts)

    // challengeMastery includes guessed = 100%
    expect(mastery.challengeMastery).toBe(100)
    // challengeMasteryExcludingGuessed excludes guessed = 50%
    expect(mastery.challengeMasteryExcludingGuessed).toBe(50)
  })
})
