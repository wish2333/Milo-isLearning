import { describe, it, expect } from 'vitest'
import type { Module, ProgressState } from '@/types/domain'
import { computeModuleProgress } from './module-progress'

// -- fixture helpers ----------------------------------------------------------

function makeModule(conceptCount: number): Module {
  const concepts = Array.from({ length: conceptCount }, (_, i) => ({
    id: `concept-${i + 1}`,
    moduleId: 'mod-1',
    name: `概念 ${i + 1}`,
    definition: `定义 ${i + 1}`,
    type: 'fact' as const,
    keyPoints: ['关键点 1', '关键点 2'],
    quizSeries: {
      conceptId: `concept-${i + 1}`,
      quizzes: [
        {
          id: `quiz-${i + 1}-1`,
          conceptId: `concept-${i + 1}`,
          ladderLevel: 1 as const,
          expressionLevel: 1 as const,
          interactionType: 'choice' as const,
          stem: `题干 ${i + 1}-1`,
          answer: 'A',
          explanation: '解析',
          distractors: ['B', 'C', 'D'],
          options: ['A', 'B', 'C', 'D'],
        },
      ],
    },
    order: i,
  }))

  return {
    id: 'mod-1',
    sourceId: 'src-1',
    title: '测试模块',
    intro: '简介',
    goal: '目标',
    concepts,
    feynmanTask: {
      moduleId: 'mod-1',
      steps: [],
      finalPrompt: '',
      rubric: [],
    },
    order: 1,
  }
}

function makeProgress(stage: ProgressState['stage']): ProgressState {
  return { moduleId: 'mod-1', stage, updatedAt: Date.now() }
}

// -- tests --------------------------------------------------------------------

describe('computeModuleProgress', () => {
  // #1: progress = null
  it('returns "未开始" when progress is null', () => {
    const result = computeModuleProgress(makeModule(5), null)
    expect(result).toEqual({
      completedConcepts: 0,
      currentConceptIndex: -1,
      conceptPercent: 0,
      label: '未开始',
      done: false,
      started: false,
    })
  })

  // #2: progress.stage = null (falsy stage)
  it('returns "未开始" when progress.stage is null', () => {
    const result = computeModuleProgress(makeModule(5), {
      moduleId: 'mod-1',
      stage: null as never,
      updatedAt: 0,
    })
    // In practice ProgressState.stage is required, but we guard with !progress.stage
    expect(result.started).toBe(false)
    expect(result.completedConcepts).toBe(0)
  })

  // #3: stage.kind = 'module_intro'
  it('returns "未开始" with started=false for module_intro', () => {
    const mod = makeModule(5)
    const progress = makeProgress({ kind: 'module_intro' })
    const result = computeModuleProgress(mod, progress)
    expect(result).toEqual({
      completedConcepts: 0,
      currentConceptIndex: -1,
      conceptPercent: 0,
      label: '未开始',
      done: false,
      started: false,
    })
  })

  // #4: stage.kind = 'concept_intro', conceptIndex=1, total=5
  it('computes concept_intro progress correctly (conceptIndex=1, total=5)', () => {
    const mod = makeModule(5)
    const progress = makeProgress({ kind: 'concept_intro', conceptIndex: 1 })
    const result = computeModuleProgress(mod, progress)
    // round((1+0.5)/5*100) = round(30) = 30
    expect(result.completedConcepts).toBe(1)
    expect(result.conceptPercent).toBe(30)
    expect(result.currentConceptIndex).toBe(1)
    expect(result.label).toBe('概念 2/5')
    expect(result.positionLabel).toBe('知识导论')
    expect(result.started).toBe(true)
    expect(result.done).toBe(false)
  })

  // #5: stage.kind = 'concept', conceptIndex=2, total=5
  it('computes concept progress correctly (conceptIndex=2, total=5)', () => {
    const mod = makeModule(5)
    const progress = makeProgress({ kind: 'concept', conceptIndex: 2, quizIndex: 1 })
    const result = computeModuleProgress(mod, progress)
    // round((2+0.5)/5*100) = round(50) = 50
    expect(result.completedConcepts).toBe(2)
    expect(result.conceptPercent).toBe(50)
    expect(result.label).toBe('概念 3/5')
    expect(result.positionLabel).toBe('题目 1/1')
  })

  // #6: concept with quizIndex — does not depend on quizIndex
  it('ignores quizIndex for percentage calculation', () => {
    const mod = makeModule(5)
    const progress = makeProgress({ kind: 'concept', conceptIndex: 2, quizIndex: 5 })
    const result = computeModuleProgress(mod, progress)
    // Same as #5 — quizIndex should not affect concept-level progress
    expect(result.completedConcepts).toBe(2)
    expect(result.conceptPercent).toBe(50)
  })

  // #7: stage.kind = 'challenge'
  it('returns "最后阶段" with 95% for challenge', () => {
    const mod = makeModule(5)
    const progress = makeProgress({ kind: 'challenge', quizIndex: 0 })
    const result = computeModuleProgress(mod, progress)
    expect(result.completedConcepts).toBe(5)
    expect(result.conceptPercent).toBe(95)
    expect(result.label).toBe('最后阶段')
    expect(result.done).toBe(false)
    expect(result.started).toBe(true)
  })

  // #8: stage.kind = 'feynman_final'
  it('returns "最后阶段" with 95% for feynman_final', () => {
    const mod = makeModule(5)
    const progress = makeProgress({ kind: 'feynman_final' })
    const result = computeModuleProgress(mod, progress)
    expect(result.completedConcepts).toBe(5)
    expect(result.conceptPercent).toBe(95)
    expect(result.label).toBe('最后阶段')
  })

  // #9: stage.kind = 'done'
  it('returns "已完成" with 100% for done', () => {
    const mod = makeModule(5)
    const progress = makeProgress({ kind: 'done' })
    const result = computeModuleProgress(mod, progress)
    expect(result).toEqual({
      completedConcepts: 5,
      currentConceptIndex: -1,
      conceptPercent: 100,
      label: '已完成',
      done: true,
      started: true,
    })
  })

  // #10: empty module (concepts=[]) + concept stage
  it('handles empty module without error (conceptPercent=0)', () => {
    const mod = makeModule(0)
    const progress = makeProgress({ kind: 'concept', conceptIndex: 0, quizIndex: 0 })
    const result = computeModuleProgress(mod, progress)
    expect(result.conceptPercent).toBe(0)
    expect(result.completedConcepts).toBe(0)
    expect(result.label).toBe('概念 1/0')
  })

  // #11: conceptIndex out of bounds (conceptIndex=10, total=3)
  it('clamps percentage to 99 for out-of-bounds conceptIndex', () => {
    const mod = makeModule(3)
    const progress = makeProgress({ kind: 'concept', conceptIndex: 10, quizIndex: 0 })
    const result = computeModuleProgress(mod, progress)
    // round((10+0.5)/3*100) = round(350) = 350 → clamped to 99
    expect(result.conceptPercent).toBe(99)
    expect(result.completedConcepts).toBe(10)
    expect(result.currentConceptIndex).toBe(10)
  })

  // #bonus: feynman_intro and feynman_step also return "最后阶段"
  it('returns "最后阶段" for feynman_intro', () => {
    const mod = makeModule(4)
    const progress = makeProgress({ kind: 'feynman_intro' })
    const result = computeModuleProgress(mod, progress)
    expect(result.completedConcepts).toBe(4)
    expect(result.conceptPercent).toBe(95)
    expect(result.label).toBe('最后阶段')
  })

  it('returns "最后阶段" for feynman_step', () => {
    const mod = makeModule(4)
    const progress = makeProgress({ kind: 'feynman_step', stepOrder: 3 })
    const result = computeModuleProgress(mod, progress)
    expect(result.completedConcepts).toBe(4)
    expect(result.conceptPercent).toBe(95)
    expect(result.label).toBe('最后阶段')
  })

  it('includes answered quiz count when attempts are provided', () => {
    const mod = makeModule(2)
    const result = computeModuleProgress(
      mod,
      makeProgress({ kind: 'concept', conceptIndex: 0, quizIndex: 0 }),
      {
        'quiz-1-1': [
          {
            id: 'attempt-1',
            quizId: 'quiz-1-1',
            originalQuizId: 'quiz-1-1',
            attemptVersion: 0,
            userAnswer: 'A',
            score: 100,
            gaps: [],
            nextAction: 'advance',
            timestamp: 1,
          },
        ],
      },
    )
    expect(result.answeredQuizCount).toBe(1)
    expect(result.label).toBe('概念 1/2 · 已答 1 题')
  })

  it('shows review position instead of pretending it is a normal question', () => {
    const mod = makeModule(1)
    const result = computeModuleProgress(
      mod,
      makeProgress({
        kind: 'concept',
        conceptIndex: 0,
        quizIndex: 1,
        reviewSlots: ['quiz-1-1'],
      }),
    )
    expect(result.positionLabel).toBe('复习题 1/1')
  })
})
