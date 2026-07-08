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
import { buildQualityReport } from '@/lib/compiler/quality/quality-report'

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
      mapperFixStats: { totalFixes: 2, answerMovedToFirstOption: 1, duplicateOptionsRemoved: 1 },
      semanticEvalStats: { calls: 3, cacheHits: 1, semanticAccepted: 1, providerFailures: 0 },
    })

    expect(report.mapperFixStats.totalFixes).toBe(2)
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
