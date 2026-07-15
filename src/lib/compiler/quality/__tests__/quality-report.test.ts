/**
 * CompileQualityReport — pure function tests (M7.5)
 *
 * Covers:
 *   A. Empty module
 *   B. Module with concepts, challenges, feynman steps
 *   C. avgDistractorsPerQuiz computation
 */

import { describe, expect, it } from 'vitest'
import type { Module, FeynmanTask } from '@/types/domain'
import { buildQualityReport, estimateCost } from '@/lib/compiler/quality/quality-report'

// =================================================================
// Helpers
// =================================================================

const DEFAULT_META = { generatedAt: 1_700_000_000_000 }

function emptyModule(): Module {
  const feynman: FeynmanTask = { moduleId: 'm-empty', steps: [], finalPrompt: '', rubric: [] }
  return {
    id: 'm-empty',
    sourceId: 'src-empty',
    title: 'Empty',
    intro: '',
    goal: '',
    concepts: [],
    feynmanTask: feynman,
    order: 1,
  }
}

/**
 * 创建一个有内容的 Module：
 *   - 2 concepts，每 concept 2 quizzes（混合 expression/ladder levels）
 *   - 1 challenge quiz 带 involvedConceptIds
 *   - 1 feynman step
 */
function populatedModule(): Module {
  const feynman: FeynmanTask = {
    moduleId: 'm-demo',
    steps: [
      {
        order: 1,
        type: 'choice',
        stem: 'Explain...',
        options: ['A', 'B', 'C', 'D'],
        answer: 'A',
        explanation: 'ok',
      },
    ],
    finalPrompt: 'Final prompt',
    rubric: ['Rubric 1'],
  }

  return {
    id: 'm-demo',
    sourceId: 'src-demo',
    title: 'Demo',
    intro: 'Intro text',
    goal: 'Goal text',
    concepts: [
      {
        id: 'c1',
        moduleId: 'm-demo',
        name: 'Concept One',
        definition: 'Def 1',
        type: 'fact',
        keyPoints: ['KP1'],
        order: 1,
        quizSeries: {
          conceptId: 'c1',
          quizzes: [
            {
              id: 'c1:q1',
              conceptId: 'c1',
              ladderLevel: 1,
              expressionLevel: 1,
              interactionType: 'choice',
              stem: 'Quiz 1',
              options: ['A', 'B', 'C', 'D'],
              answer: 'A',
              explanation: 'Explanation 1',
              distractors: ['d1a', 'd1b'],
            },
            {
              id: 'c1:q2',
              conceptId: 'c1',
              ladderLevel: 2,
              expressionLevel: 2,
              interactionType: 'sorting',
              stem: 'Quiz 2',
              options: ['A', 'B', 'C'],
              answer: 'A',
              explanation: 'Explanation 2',
              distractors: ['d2a'],
            },
          ],
        },
      },
      {
        id: 'c2',
        moduleId: 'm-demo',
        name: 'Concept Two',
        definition: 'Def 2',
        type: 'procedure',
        keyPoints: ['KP2'],
        order: 2,
        quizSeries: {
          conceptId: 'c2',
          quizzes: [
            {
              id: 'c2:q1',
              conceptId: 'c2',
              ladderLevel: 3,
              expressionLevel: 1,
              interactionType: 'choice',
              stem: 'Quiz 3',
              options: ['A', 'B', 'C', 'D'],
              answer: 'A',
              explanation: 'Explanation 3',
              distractors: ['d3a', 'd3b', 'd3c'],
            },
            {
              id: 'c2:q2',
              conceptId: 'c2',
              ladderLevel: 1,
              expressionLevel: 3,
              interactionType: 'fill_blank',
              stem: 'Quiz 4',
              answer: 'Answer 4',
              explanation: 'Explanation 4',
              distractors: ['d4a'],
            },
          ],
        },
      },
    ],
    challengeQuizzes: [
      {
        id: 'challenge-1',
        conceptId: 'challenge',
        ladderLevel: 3,
        expressionLevel: 1,
        interactionType: 'choice',
        stem: 'Challenge 1',
        options: ['A', 'B', 'C', 'D'],
        answer: 'A',
        explanation: 'Challenge explanation',
        distractors: ['cd1', 'cd2'],
        involvedConceptIds: ['c1', 'c2'],
      },
    ],
    feynmanTask: feynman,
    order: 1,
  }
}

// =================================================================
// A. Empty module
// =================================================================

describe('A. empty module', () => {
  it('reports all zeros for empty module', () => {
    const report = buildQualityReport(emptyModule(), DEFAULT_META)

    expect(report.moduleId).toBe('m-empty')
    expect(report.generatedAt).toBe(DEFAULT_META.generatedAt)
    expect(report.conceptCount).toBe(0)
    expect(report.quizCount).toBe(0)
    expect(report.challengeCount).toBe(0)
    expect(report.expressionDistribution).toEqual({ 1: 0, 2: 0, 3: 0 })
    expect(report.ladderDistribution).toEqual({ 1: 0, 2: 0, 3: 0 })
    expect(report.avgDistractorsPerQuiz).toBe(0)
    expect(report.challengeCoverage).toEqual([])
  })
})

// =================================================================
// B. Populated module
// =================================================================

describe('B. populated module', () => {
  it('reports correct counts', () => {
    const report = buildQualityReport(populatedModule(), DEFAULT_META)

    // 2 concepts
    expect(report.conceptCount).toBe(2)
    // 4 concept quizzes + 1 challenge + 1 feynman step = 6
    expect(report.quizCount).toBe(6)
    // 1 challenge
    expect(report.challengeCount).toBe(1)
  })

  it('reports correct expressionDistribution (concept + challenge = 5 quizzes)', () => {
    const report = buildQualityReport(populatedModule(), DEFAULT_META)

    // concept: c1:q1=1, c1:q2=2, c2:q1=1, c2:q2=3 → {1:2, 2:1, 3:1}
    // challenge: challenge-1=1 → {1:3, 2:1, 3:1}
    expect(report.expressionDistribution).toEqual({ 1: 3, 2: 1, 3: 1 })

    // total quiz distribution entries = 4 concept + 1 challenge = 5
    const distTotal = Object.values(report.expressionDistribution).reduce((a, b) => a + b, 0)
    expect(distTotal).toBe(5)
  })

  it('reports correct ladderDistribution', () => {
    const report = buildQualityReport(populatedModule(), DEFAULT_META)

    // concept: c1:q1=1, c1:q2=2, c2:q1=3, c2:q2=1 → {1:2, 2:1, 3:1}
    // challenge: challenge-1=3 → {1:2, 2:1, 3:2}
    expect(report.ladderDistribution).toEqual({ 1: 2, 2: 1, 3: 2 })

    const distTotal = Object.values(report.ladderDistribution).reduce((a, b) => a + b, 0)
    expect(distTotal).toBe(5)
  })

  it('reports correct challengeCoverage', () => {
    const report = buildQualityReport(populatedModule(), DEFAULT_META)

    expect(report.challengeCoverage).toHaveLength(1)
    expect(report.challengeCoverage[0]!.quizId).toBe('challenge-1')
    expect(report.challengeCoverage[0]!.involvedConceptIds).toEqual(['c1', 'c2'])
  })

  it('reports pedagogy coverage for background, extended knowledge, and fill blank answers', () => {
    const mod = populatedModule()
    mod.concepts[0]!.quizSeries.quizzes[0] = {
      ...mod.concepts[0]!.quizSeries.quizzes[0]!,
      background: '这是一段足够长的题目前背景，用来说明题目场景。',
      extendedKnowledge: '这是一段足够长的延伸知识，用来帮助迁移理解。',
      explanation: 'x'.repeat(100),
    }
    mod.concepts[1]!.quizSeries.quizzes[1] = {
      ...mod.concepts[1]!.quizSeries.quizzes[1]!,
      acceptableAnswers: ['Answer 4', 'answer four'],
      explanation: 'x'.repeat(80),
    }

    const report = buildQualityReport(mod, DEFAULT_META)

    expect(report.pedagogyCoverage.quizCount).toBe(5)
    expect(report.pedagogyCoverage.backgroundCoverage).toBe(0.2)
    expect(report.pedagogyCoverage.extendedKnowledgeCoverage).toBe(0.2)
    expect(report.pedagogyCoverage.fillBlankAcceptableAnswerCoverage).toBe(1)
    expect(report.pedagogyCoverage.averageExplanationLength).toBeGreaterThan(20)
  })

  it('accepts mapper fix and semantic eval stats in report metadata', () => {
    const report = buildQualityReport(populatedModule(), {
      ...DEFAULT_META,
      mapperFixStats: { answerMovedToFirstOption: 1, duplicateOptionsRemoved: 1 },
      semanticEvalStats: { calls: 3, cacheHits: 1, semanticAccepted: 1, providerFailures: 0 },
    })

    // totalFixes = sum of all individual counters
    expect(report.mapperFixStats.totalFixes).toBe(2)
    expect(report.mapperFixStats.answerMovedToFirstOption).toBe(1)
    expect(report.mapperFixStats.duplicateOptionsRemoved).toBe(1)
    expect(report.semanticEvalStats.calls).toBe(3)
    expect(report.estimatedRuntimeEvalCost.semanticCalls).toBe(3)
  })
})

// =================================================================
// C. avgDistractorsPerQuiz
// =================================================================

describe('C. avgDistractorsPerQuiz', () => {
  it('computes average across concept + challenge quizzes', () => {
    const report = buildQualityReport(populatedModule(), DEFAULT_META)

    // Concept quizzes: c1:q1=2, c1:q2=1, c2:q1=3, c2:q2=1 → total 7
    // Challenge: challenge-1=2
    // Total: 9 distractors across 5 quizzes
    // avg = 9 / 5 = 1.8
    expect(report.avgDistractorsPerQuiz).toBe(1.8)
  })
})

// =================================================================
// D. MapperFixStats counters
// =================================================================

describe('D. mapperFixStats counters', () => {
  it('totalFixes = sum of all individual counters', () => {
    const report = buildQualityReport(populatedModule(), {
      ...DEFAULT_META,
      mapperFixStats: {
        answerMovedToFirstOption: 3,
        duplicateOptionsRemoved: 1,
        shortExtendedKnowledgeFallback: 2,
        shortMisconceptionFallback: 1,
      },
    })

    expect(report.mapperFixStats.totalFixes).toBe(3 + 1 + 2 + 1)
    expect(report.mapperFixStats.answerMovedToFirstOption).toBe(3)
    expect(report.mapperFixStats.duplicateOptionsRemoved).toBe(1)
    expect(report.mapperFixStats.shortExtendedKnowledgeFallback).toBe(2)
    expect(report.mapperFixStats.shortMisconceptionFallback).toBe(1)
  })

  it('all counters default to zero when no stats provided', () => {
    const report = buildQualityReport(emptyModule(), DEFAULT_META)

    expect(report.mapperFixStats.totalFixes).toBe(0)
    expect(report.mapperFixStats.answerMovedToFirstOption).toBe(0)
    expect(report.mapperFixStats.duplicateOptionsRemoved).toBe(0)
    expect(report.mapperFixStats.shortExtendedKnowledgeFallback).toBe(0)
    expect(report.mapperFixStats.shortMisconceptionFallback).toBe(0)
  })
})

// =================================================================
// E. estimateCost
// =================================================================

describe('E. estimateCost', () => {
  it('computes cost with deepseek pricing (1M prompt + 1M completion)', () => {
    const usage = {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    }
    const cost = estimateCost(usage, 'deepseek')

    // deepseek: input=$0.14/1M, output=$0.28/1M
    expect(cost.inputCost).toBeCloseTo(0.14, 6)
    expect(cost.outputCost).toBeCloseTo(0.28, 6)
    expect(cost.totalCost).toBeCloseTo(0.42, 6)
    expect(cost.currency).toBe('USD')
  })

  it('computes cost with glm pricing', () => {
    const usage = {
      promptTokens: 500_000,
      completionTokens: 500_000,
      totalTokens: 1_000_000,
    }
    const cost = estimateCost(usage, 'glm')

    // glm: input=$0.50/1M, output=$0.50/1M
    expect(cost.inputCost).toBeCloseTo(0.25, 6)
    expect(cost.outputCost).toBeCloseTo(0.25, 6)
    expect(cost.totalCost).toBeCloseTo(0.5, 6)
  })

  it('uses default pricing for unknown provider', () => {
    const usage = {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    }
    const cost = estimateCost(usage, 'unknown-provider')

    // default fallback: input=$1.00/1M, output=$3.00/1M
    expect(cost.inputCost).toBeCloseTo(1.0, 6)
    expect(cost.outputCost).toBeCloseTo(3.0, 6)
    expect(cost.totalCost).toBeCloseTo(4.0, 6)
  })

  it('returns zero cost for zero usage', () => {
    const usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }
    const cost = estimateCost(usage, 'deepseek')

    expect(cost.inputCost).toBe(0)
    expect(cost.outputCost).toBe(0)
    expect(cost.totalCost).toBe(0)
  })
})

// =================================================================
// F. buildQualityReport with token usage
// =================================================================

describe('F. buildQualityReport with token usage', () => {
  it('includes tokenUsage and estimatedCost when totalUsage + providerKind provided', () => {
    const report = buildQualityReport(populatedModule(), {
      ...DEFAULT_META,
      totalUsage: {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      },
      providerKind: 'deepseek',
    })

    expect(report.tokenUsage).toEqual({
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    })
    expect(report.estimatedCost).toBeDefined()
    expect(report.estimatedCost!.totalCost).toBeCloseTo(0.42, 6)
    expect(report.estimatedCost!.currency).toBe('USD')
  })

  it('omits tokenUsage and estimatedCost when totalUsage not provided', () => {
    const report = buildQualityReport(populatedModule(), DEFAULT_META)

    expect(report.tokenUsage).toBeUndefined()
    expect(report.estimatedCost).toBeUndefined()
  })

  it('omits estimatedCost when providerKind not provided', () => {
    const report = buildQualityReport(populatedModule(), {
      ...DEFAULT_META,
      totalUsage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
      },
    })

    expect(report.tokenUsage).toBeDefined()
    expect(report.estimatedCost).toBeUndefined()
  })

  it('returns zero cost when totalUsage has zero tokens', () => {
    const report = buildQualityReport(populatedModule(), {
      ...DEFAULT_META,
      totalUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      providerKind: 'deepseek',
    })

    expect(report.tokenUsage!.totalTokens).toBe(0)
    expect(report.estimatedCost!.totalCost).toBe(0)
  })

  it('preserves existing mapperFixStats and semanticEvalStats when token usage is also provided', () => {
    const report = buildQualityReport(populatedModule(), {
      ...DEFAULT_META,
      mapperFixStats: { answerMovedToFirstOption: 5, duplicateOptionsRemoved: 3 },
      semanticEvalStats: { calls: 10, cacheHits: 4, semanticAccepted: 8, providerFailures: 1 },
      totalUsage: {
        promptTokens: 500_000,
        completionTokens: 200_000,
        totalTokens: 700_000,
      },
      providerKind: 'glm',
    })

    expect(report.mapperFixStats.totalFixes).toBe(5 + 3)
    expect(report.semanticEvalStats.calls).toBe(10)
    expect(report.tokenUsage!.promptTokens).toBe(500_000)
    expect(report.estimatedCost!.currency).toBe('USD')
  })
})
