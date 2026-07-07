import { describe, expect, it } from 'vitest'

import {
  chunkSchema,
  conceptSchema,
  feedbackSchema,
  feynmanEvalSchema,
  feynmanSchema,
  importSchema,
  missionSchema,
  moduleSchema,
  quizSchema,
  schemasByAgentKind,
} from '../index'

/**
 * Schema smoke 测试
 *
 * 目的：保证 10 个 Zod Schema 在编译期与运行时都可用。
 * M1 之前 Schema 从未跑过 tsc，本测试是最低限度的运行时回归基线。
 */

const ALL_SCHEMAS = {
  import: importSchema,
  chunk: chunkSchema,
  concept: conceptSchema,
  module: moduleSchema,
  mission: missionSchema,
  quiz: quizSchema,
  feynman: feynmanSchema,
  feedback: feedbackSchema,
  'feynman-eval': feynmanEvalSchema,
} as const

describe('compiler schemas — smoke test', () => {
  it('schemasByAgentKind exports all 10 agent kinds', () => {
    const kinds = Object.keys(schemasByAgentKind).sort()
    expect(kinds).toEqual(
      [
        'chunk',
        'concept',
        'feedback',
        'feynman',
        'feynman-eval',
        'import',
        'mission',
        'module',
        'quiz',
        'quiz-batch',
      ].sort(),
    )
    expect(kinds).toHaveLength(10)
  })

  it('every schema is a ZodSchema (has safeParse + parse)', () => {
    for (const [name, schema] of Object.entries(ALL_SCHEMAS)) {
      expect(typeof schema.safeParse, `${name}.safeParse`).toBe('function')
      expect(typeof schema.parse, `${name}.parse`).toBe('function')
    }
  })

  it('conceptSchema rejects empty concepts array', () => {
    const result = conceptSchema.safeParse({
      reasoning: 'x',
      concepts: [],
    })
    expect(result.success).toBe(false)
  })

  it('conceptSchema accepts a minimal valid payload', () => {
    const result = conceptSchema.safeParse({
      reasoning: 'private CoT',
      concepts: [
        {
          id: 'concept-1',
          name: 'RAG',
          definition: '检索增强生成',
          type: 'theory',
          keyPoints: ['检索', '生成'],
          parentChunkId: 'chunk-1',
        },
        {
          id: 'concept-2',
          name: 'Embedding',
          definition: '向量表示',
          type: 'fact',
          keyPoints: ['稠密向量', '相似度'],
          parentChunkId: 'chunk-2',
        },
      ],
    })
    if (!result.success) {
      console.error(result.error.issues)
    }
    expect(result.success).toBe(true)
  })

  it('feedbackSchema rejects forbidden negative words', () => {
    const result = feedbackSchema.safeParse({
      score: 0,
      gaps: ['key point'],
      next_action: 'retry',
      feedback_text: '错误！再试一次。',
    })
    expect(result.success).toBe(false)
  })

  it('moduleSchema enforces intro prefix', () => {
    const result = moduleSchema.safeParse({
      reasoning: 'x',
      module: {
        id: 'module-1',
        title: 'RAG 入门',
        intro: '欢迎使用本课程', // 缺少正确前缀
        goal: '解释 RAG',
        conceptOrder: ['concept-1', 'concept-2'],
      },
    })
    expect(result.success).toBe(false)
  })

  it('missionSchema enforces first-2-must-be-L1-Choice-E1', () => {
    const result = missionSchema.safeParse({
      reasoning: 'x',
      seriesByConcept: {
        'concept-1': [
          // 第一个就是 L2，应该被拒
          {
            id: 'concept-1:slot-1',
            ladderLevel: 2,
            interactionType: 'choice',
            expressionLevel: 1,
          },
        ],
      },
    })
    expect(result.success).toBe(false)
  })

  it('feynmanSchema enforces exactly 6 steps', () => {
    const result = feynmanSchema.safeParse({
      reasoning: 'x',
      feynmanTask: {
        moduleId: 'module-1',
        steps: [
          {
            order: 1,
            type: 'choice',
            stem: 'stem',
            options: ['a', 'b', 'c', 'd'],
            answer: 'a',
            explanation: 'expl '.repeat(5),
          },
        ],
        finalPrompt: 'explain X',
        rubric: ['point one', 'point two', 'point three'],
      },
    })
    expect(result.success).toBe(false)
  })
})
