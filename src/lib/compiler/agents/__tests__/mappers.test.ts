// mappers.test.ts — M2.5 W5 映射层单测
//
// 覆盖：
//   - mapFeedback：唯一的 snake_case → camelCase 转换
//   - 各 identity mapper 不破坏数据
//   - assemble* 帮手函数字段映射正确

import { describe, expect, it } from 'vitest'

import type {
  ChunkAgentOutput,
  ConceptAgentOutput,
  FeedbackAgentOutput,
  ImportAgentOutput,
  MissionAgentOutput,
  ModuleAgentOutput,
  QuizAgentOutput,
  FeynmanAgentOutput,
  FeynmanEvalOutput,
} from '@/lib/compiler/schemas'

import {
  assembleConcept,
  assembleFeynmanTask,
  assembleModule,
  assembleQuiz,
  mapChunk,
  mapConcept,
  mapFeedback,
  mapFeynman,
  mapFeynmanEval,
  mapImport,
  mapMission,
  mapModule,
  mapQuiz,
} from '../mappers'

// =================================================================
// 测试夹具
// =================================================================

const feedbackOutput: FeedbackAgentOutput = {
  score: 100,
  gaps: [],
  next_action: 'advance',
  feedback_text: '答得不错，继续加油！',
}

const feedbackOutputRetry: FeedbackAgentOutput = {
  reasoning: '用户选了干扰项',
  score: 0,
  gaps: ['混淆了 X 与 Y'],
  next_action: 'retry',
  feedback_text: '差一点！关键在于 X 与 Y 的差异。',
}

const importOutput: ImportAgentOutput = {
  normalizedText: 'xxx',
  stats: { originalLength: 100, normalizedLength: 90, removedElements: 2 },
}

const chunkOutput: ChunkAgentOutput = {
  chunks: [{ id: 'chunk-1', text: 'xxx', heading: 'H' }],
}

const conceptOutput: ConceptAgentOutput = {
  reasoning: 'CoT',
  concepts: [
    {
      id: 'concept-1',
      name: 'X',
      definition: 'def',
      type: 'fact',
      keyPoints: ['a', 'b'],
      parentChunkId: 'chunk-1',
    },
  ],
}

const moduleOutput: ModuleAgentOutput = {
  reasoning: 'CoT',
  module: {
    id: 'module-1',
    title: 'T',
    intro: '完成本模块后你能 X',
    goal: '解释 X',
    conceptOrder: ['concept-1', 'concept-2'],
  },
}

const missionOutput: MissionAgentOutput = {
  reasoning: 'CoT',
  seriesByConcept: {
    'concept-1': [
      {
        id: 'concept-1:slot-1',
        ladderLevel: 1,
        interactionType: 'choice',
        expressionLevel: 1,
      },
    ],
  },
}

const quizOutput: QuizAgentOutput = {
  reasoning: 'CoT',
  quiz: {
    id: 'concept-1:slot-1',
    conceptId: 'concept-1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: '题干？',
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: '解释。' + 'x'.repeat(20),
    distractors: [
      { text: 'B', type: 'A_Overcorrection', used: false },
      { text: 'C', type: 'B_Outdated', used: false },
      { text: 'D', type: 'C_WrongContext', used: false },
    ],
  },
}

const feynmanOutput: FeynmanAgentOutput = {
  reasoning: 'CoT',
  feynmanTask: {
    moduleId: 'module-1',
    steps: Array.from({ length: 6 }, (_, i) => ({
      order: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6,
      type: i === 4 ? ('fill_blank' as const) : ('choice' as const),
      stem: `Step ${i + 1}`,
      options: i === 4 ? null : ['A', 'B', 'C', 'D'],
      answer: i === 4 ? 'ans' : 'A',
      explanation: 'x'.repeat(20),
    })),
    finalPrompt: '请完整解释 X',
    rubric: ['点 1', '点 2', '点 3'],
  },
}

const feynmanEvalOutput: FeynmanEvalOutput = {
  reasoning: 'CoT',
  score: 67,
  rubricResults: [
    { point: '点 1', hit: 'full', comment: 'x'.repeat(5) },
    { point: '点 2', hit: 'partial', comment: 'y'.repeat(5) },
    { point: '点 3', hit: 'none', comment: 'z'.repeat(5) },
  ],
  gaps: ['点 3'],
  sampleAnswer: 'x'.repeat(150),
}

// =================================================================
// 测试用例
// =================================================================

describe('mapFeedback', () => {
  it('converts snake_case next_action/feedback_text to camelCase', () => {
    const r = mapFeedback(feedbackOutput)
    expect(r.score).toBe(100)
    expect(r.gaps).toEqual([])
    expect(r.nextAction).toBe('advance')
    expect(r.feedbackText).toBe('答得不错，继续加油！')
  })

  it('preserves gaps + retry on score=0', () => {
    const r = mapFeedback(feedbackOutputRetry)
    expect(r.score).toBe(0)
    expect(r.gaps).toEqual(['混淆了 X 与 Y'])
    expect(r.nextAction).toBe('retry')
  })

  it('drops reasoning (not in domain)', () => {
    const r = mapFeedback(feedbackOutputRetry)
    expect((r as unknown as Record<string, unknown>).reasoning).toBeUndefined()
  })
})

describe('identity mappers (other agents already camelCase)', () => {
  it('mapImport returns same object', () => {
    expect(mapImport(importOutput)).toBe(importOutput)
  })
  it('mapChunk returns same object', () => {
    expect(mapChunk(chunkOutput)).toBe(chunkOutput)
  })
  it('mapConcept returns same object', () => {
    expect(mapConcept(conceptOutput)).toBe(conceptOutput)
  })
  it('mapModule returns same object', () => {
    expect(mapModule(moduleOutput)).toBe(moduleOutput)
  })
  it('mapMission returns same object', () => {
    expect(mapMission(missionOutput)).toBe(missionOutput)
  })
  it('mapQuiz returns same object', () => {
    expect(mapQuiz(quizOutput)).toBe(quizOutput)
  })
  it('mapFeynman returns same object', () => {
    expect(mapFeynman(feynmanOutput)).toBe(feynmanOutput)
  })
  it('mapFeynmanEval returns same object', () => {
    expect(mapFeynmanEval(feynmanEvalOutput)).toBe(feynmanEvalOutput)
  })
})

describe('assemble helpers', () => {
  it('assembleConcept fills moduleId + order + empty quizSeries', () => {
    const c = assembleConcept(conceptOutput.concepts[0]!, 'module-7', 3)
    expect(c).toEqual({
      id: 'concept-1',
      moduleId: 'module-7',
      name: 'X',
      definition: 'def',
      type: 'fact',
      keyPoints: ['a', 'b'],
      quizSeries: { conceptId: 'concept-1', quizzes: [] },
      order: 3,
    })
  })

  it('assembleQuiz flattens distractors[].text to string[]', () => {
    const q = assembleQuiz(quizOutput.quiz)
    expect(q.distractors).toEqual(['B', 'C', 'D'])
    expect(q.options).toEqual(['A', 'B', 'C', 'D'])
    expect(q.interactionType).toBe('choice')
  })

  it('assembleFeynmanTask preserves all 6 steps + rubric', () => {
    const ft = assembleFeynmanTask(feynmanOutput.feynmanTask)
    expect(ft.steps).toHaveLength(6)
    expect(ft.steps[4]?.type).toBe('fill_blank')
    expect(ft.steps[4]?.options).toBeNull()
    expect(ft.rubric).toEqual(['点 1', '点 2', '点 3'])
    expect(ft.finalPrompt).toBe('请完整解释 X')
  })

  it('assembleModule merges module + concepts + feynmanTask', () => {
    const asmConcepts = [assembleConcept(conceptOutput.concepts[0]!, 'module-1', 1)]
    const asmFeynman = assembleFeynmanTask(feynmanOutput.feynmanTask)
    const m = assembleModule(moduleOutput.module, {
      sourceId: 'source-1',
      concepts: asmConcepts,
      feynmanTask: asmFeynman,
    })
    expect(m.id).toBe('module-1')
    expect(m.sourceId).toBe('source-1')
    expect(m.concepts).toBe(asmConcepts)
    expect(m.feynmanTask).toBe(asmFeynman)
    expect(m.order).toBe(1) // 默认
  })

  it('assembleModule honors explicit order', () => {
    const asmConcepts = [assembleConcept(conceptOutput.concepts[0]!, 'module-1', 1)]
    const asmFeynman = assembleFeynmanTask(feynmanOutput.feynmanTask)
    const m = assembleModule(moduleOutput.module, {
      sourceId: 's',
      concepts: asmConcepts,
      feynmanTask: asmFeynman,
      order: 5,
    })
    expect(m.order).toBe(5)
  })
})
