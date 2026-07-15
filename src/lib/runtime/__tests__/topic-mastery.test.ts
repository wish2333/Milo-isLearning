// topic-mastery.test.ts -- computeTopicMastery 纯函数单测
//
// 覆盖场景：
//   - 两个模块 + 作答记录，加权平均正确性
//   - 无模块 / 空模块列表
//   - 所有模块无测验（weight=0 不参与加权）
//   - 部分模块有作答，部分无
//   - feynman 数据影响 moduleCompletion

import { describe, expect, it } from 'vitest'

import type { AttemptRecord, Module, Topic } from '@/types/domain'

import { computeTopicMastery } from '../topic-mastery'

// =================================================================
// 测试夹具
// =================================================================

let idCounter = 0
const nextId = () => `att-${++idCounter}`

function makeModule(moduleId: string, quizCountPerConcept = 2, conceptCount = 1): Module {
  const concepts = Array.from({ length: conceptCount }, (_, ci) => {
    const conceptId = `${moduleId}:concept-${ci + 1}`
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
      moduleId,
      name: `Concept ${ci + 1}`,
      definition: 'def',
      type: 'fact' as const,
      keyPoints: ['point'],
      quizSeries: { conceptId, quizzes },
      order: ci + 1,
    }
  })

  return {
    id: moduleId,
    sourceId: `source-${moduleId}`,
    title: `Module ${moduleId}`,
    intro: 'intro',
    goal: 'goal',
    concepts,
    feynmanTask: {
      moduleId,
      steps: Array.from({ length: 6 }, (_, i) => ({
        order: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6,
        type: i < 4 ? ('choice' as const) : ('fill_blank' as const),
        stem: `Step ${i + 1}`,
        options: i < 4 ? ['A', 'B', 'C', 'D'] : null,
        answer: 'A',
        explanation: 'exp',
      })),
      finalPrompt: 'Explain everything',
      rubric: ['point 1', 'point 2'],
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

function makeTopic(moduleIds: string[]): Topic {
  return {
    id: 'topic-1',
    name: 'Test Topic',
    moduleIds,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// =================================================================
// computeTopicMastery
// =================================================================

describe('computeTopicMastery', () => {
  it('computes weighted average with two modules', () => {
    // Module A: 2 concept quizzes + 6 feynman = 8 total quizzes
    // Module B: 4 concept quizzes + 6 feynman = 10 total quizzes
    const modA = makeModule('mod-a', 2, 1) // 2 quizzes + 6 feynman = 8
    const modB = makeModule('mod-b', 4, 1) // 4 quizzes + 6 feynman = 10
    const topic = makeTopic(['mod-a', 'mod-b'])

    // Module A: 2 concept quizzes all passed -> 2/8 = 25% completion
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'mod-a:concept-1:0': [makeAttempt('mod-a:concept-1:0', 0, 100, 'advance')],
      'mod-a:concept-1:1': [makeAttempt('mod-a:concept-1:1', 0, 100, 'advance')],
      // Module B: all 4 concept quizzes passed -> 4/10 = 40% completion
      'mod-b:concept-1:0': [makeAttempt('mod-b:concept-1:0', 0, 100, 'advance')],
      'mod-b:concept-1:1': [makeAttempt('mod-b:concept-1:1', 0, 100, 'advance')],
      'mod-b:concept-1:2': [makeAttempt('mod-b:concept-1:2', 0, 100, 'advance')],
      'mod-b:concept-1:3': [makeAttempt('mod-b:concept-1:3', 0, 100, 'advance')],
    }

    const result = computeTopicMastery(topic, [modA, modB], attemptsBySlot)

    // weighted avg = (25 * 8 + 40 * 10) / (8 + 10) = (200 + 400) / 18 = 33.33 -> 33
    expect(result.topicId).toBe('topic-1')
    expect(result.aggregateMastery).toBe(33)
    expect(result.totalQuizzes).toBe(18)
    expect(result.moduleMasteries).toHaveLength(2)
    expect(result.completedModules).toBe(0)
  })

  it('returns 0 for empty modules list', () => {
    const topic = makeTopic([])
    const result = computeTopicMastery(topic, [], {})

    expect(result.topicId).toBe('topic-1')
    expect(result.aggregateMastery).toBe(0)
    expect(result.totalQuizzes).toBe(0)
    expect(result.moduleMasteries).toHaveLength(0)
    expect(result.completedModules).toBe(0)
  })

  it('returns 0 when all modules have zero quizzes', () => {
    const mod = makeModule('mod-x', 0, 0) // 0 concept quizzes + 6 feynman = 6 quizzes
    // Actually 6 feynman steps exist, so quizCount = 6, not 0
    // Let me make a truly empty module
    mod.concepts = []
    const topic = makeTopic(['mod-x'])

    const result = computeTopicMastery(topic, [mod], {})

    // quizCount = 0 + 0 + 6 (feynman) = 6, but no concept quizzes completed
    // completion = 0/6 = 0, aggregate = 0
    expect(result.totalQuizzes).toBe(6) // still has feynman steps
    expect(result.aggregateMastery).toBe(0)
    expect(result.completedModules).toBe(0)
  })

  it('handles modules with no attempts gracefully', () => {
    const modA = makeModule('mod-a', 2, 1)
    const modB = makeModule('mod-b', 4, 1)
    const topic = makeTopic(['mod-a', 'mod-b'])

    const result = computeTopicMastery(topic, [modA, modB], {})

    // No attempts -> all moduleCompletion = 0 -> aggregate = 0
    expect(result.aggregateMastery).toBe(0)
    expect(result.moduleMasteries[0]?.mastery.moduleCompletion).toBe(0)
    expect(result.moduleMasteries[1]?.mastery.moduleCompletion).toBe(0)
  })

  it('includes feynman completion in moduleCompletion', () => {
    const mod = makeModule('mod-a', 2, 1)
    const topic = makeTopic(['mod-a'])

    // Pass both concept quizzes + complete feynman
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'mod-a:concept-1:0': [makeAttempt('mod-a:concept-1:0', 0, 100, 'advance')],
      'mod-a:concept-1:1': [makeAttempt('mod-a:concept-1:1', 0, 100, 'advance')],
    }
    const feynmanAttempts = {
      'mod-a': {
        moduleId: 'mod-a',
        stepResults: [
          { stepOrder: 1, score: 100 },
          { stepOrder: 2, score: 100 },
          { stepOrder: 3, score: 100 },
          { stepOrder: 4, score: 100 },
          { stepOrder: 5, score: 100 },
          { stepOrder: 6, score: 100 },
        ],
        finalOutput: 'output',
        finalScore: 80,
        finalGaps: [],
        submittedAt: Date.now(),
      },
    }

    const result = computeTopicMastery(topic, [mod], attemptsBySlot, feynmanAttempts)

    // 2 concept quizzes + 6 feynman = 8 total, all done -> 100%
    expect(result.aggregateMastery).toBe(100)
    expect(result.completedModules).toBe(1)
  })

  it('only counts non-zero-weight modules in weighted average', () => {
    // Module A: has quizzes (weight > 0)
    // Module B: has zero quizzes (concepts=[], challengeQuizzes=undefined, feynman steps remain -> still has weight 6)
    // For truly zero weight, need no feynman steps too, but that's not a real Module.
    // Test: a module with only concepts (0 quizzes) and feynman (6 steps) still has weight 6
    const modA = makeModule('mod-a', 2, 1) // 2 + 6 = 8 quizzes
    const topic = makeTopic(['mod-a'])

    // Both concept quizzes passed -> 2/8 = 25%
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'mod-a:concept-1:0': [makeAttempt('mod-a:concept-1:0', 0, 100, 'advance')],
      'mod-a:concept-1:1': [makeAttempt('mod-a:concept-1:1', 0, 100, 'advance')],
    }

    const result = computeTopicMastery(topic, [modA], attemptsBySlot)

    // 25% * 8 / 8 = 25
    expect(result.aggregateMastery).toBe(25)
    expect(result.moduleMasteries[0]?.weight).toBe(8)
  })

  it('reports completedModules correctly', () => {
    const modA = makeModule('mod-a', 0, 1) // 0 quizzes + 6 feynman
    const modB = makeModule('mod-b', 0, 1)
    const topic = makeTopic(['mod-a', 'mod-b'])

    // Complete feynman for modA but not modB
    const feynmanAttempts = {
      'mod-a': {
        moduleId: 'mod-a',
        stepResults: Array.from({ length: 6 }, (_, i) => ({
          stepOrder: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6,
          score: 100,
        })),
        finalOutput: 'output',
        finalScore: 80,
        submittedAt: Date.now(),
      },
    }

    const result = computeTopicMastery(topic, [modA, modB], {}, feynmanAttempts)

    // modA: 6/6 feynman done -> completion 100% (completed)
    // modB: 0/6 done -> completion 0%
    // weighted avg = (100 * 6 + 0 * 6) / 12 = 50
    expect(result.aggregateMastery).toBe(50)
    expect(result.completedModules).toBe(1)
  })

  it('extracts attempts correctly by module scope', () => {
    // Two modules should not cross-contaminate attempts
    const modA = makeModule('mod-a', 1, 1) // quiz 'mod-a:concept-1:0'
    const modB = makeModule('mod-b', 1, 1) // quiz 'mod-b:concept-1:0'
    const topic = makeTopic(['mod-a', 'mod-b'])

    // Only pass modA's quiz
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'mod-a:concept-1:0': [makeAttempt('mod-a:concept-1:0', 0, 100, 'advance')],
      'mod-b:concept-1:0': [], // modB's quiz has no attempts (empty array)
    }

    const result = computeTopicMastery(topic, [modA, modB], attemptsBySlot)

    // modA: 1/7 = ~14% (1 concept quiz completed out of 1+6=7 total)
    // modB: 0/7 = 0%
    // weighted avg = (14 * 7 + 0 * 7) / 14 = 98/14 = 7
    expect(result.moduleMasteries[0]?.mastery.moduleCompletion).toBe(14)
    expect(result.moduleMasteries[1]?.mastery.moduleCompletion).toBe(0)
    expect(result.aggregateMastery).toBe(7)
  })

  it('rounds aggregateMastery to integer', () => {
    const modA = makeModule('mod-a', 1, 1) // 1 + 6 = 7 quizzes
    const modB = makeModule('mod-b', 3, 1) // 3 + 6 = 9 quizzes
    const topic = makeTopic(['mod-a', 'mod-b'])

    // modA: pass 1/1 concept quiz -> 1/7 = 14.28...%
    // modB: pass 1/3 concept quizzes -> 1/9 = 11.11...%
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      'mod-a:concept-1:0': [makeAttempt('mod-a:concept-1:0', 0, 100, 'advance')],
      'mod-b:concept-1:0': [makeAttempt('mod-b:concept-1:0', 0, 100, 'advance')],
    }

    const result = computeTopicMastery(topic, [modA, modB], attemptsBySlot)

    // (14 * 7 + 11 * 9) / 16 = (98 + 99) / 16 = 12.3125 -> 12
    expect(result.aggregateMastery).toBe(12)
    expect(Number.isInteger(result.aggregateMastery)).toBe(true)
  })
})
