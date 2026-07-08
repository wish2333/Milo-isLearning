import { describe, expect, it } from 'vitest'

import {
  chunkSchema,
  challengeBatchSchema,
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
  it('schemasByAgentKind exports all 11 agent kinds', () => {
    const kinds = Object.keys(schemasByAgentKind).sort()
    expect(kinds).toEqual(
      [
        'challenge-batch',
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
    expect(kinds).toHaveLength(11)
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

  it('accepts enriched quiz fields without requiring old modules to have them', () => {
    const oldShapeResult = quizSchema.safeParse({
      reasoning: 'private CoT',
      quiz: {
        id: 'concept-1:slot-1',
        conceptId: 'concept-1',
        ladderLevel: 2,
        expressionLevel: 1,
        interactionType: 'choice',
        stem: 'RAG 检索片段主要在什么时候影响模型回答？',
        options: ['本次生成时', '预训练时', '部署容器启动时', '模型压缩时'],
        answer: '本次生成时',
        explanation:
          'RAG 的检索片段会在本次请求生成时提供给模型参考，它不会直接改变模型参数。判断线索是这类材料只影响当前回答。',
        distractors: [{ text: '预训练时', type: 'C_WrongContext', used: false }],
      },
    })

    expect(oldShapeResult.success).toBe(true)

    const parsed = quizSchema.parse({
      reasoning: 'private CoT',
      quiz: {
        id: 'concept-1:slot-2',
        conceptId: 'concept-1',
        ladderLevel: 2,
        expressionLevel: 3,
        interactionType: 'fill_blank',
        background:
          '团队把公司政策文档切片后放进向量库。用户提问时，系统先找回相关片段，再把片段和问题一起交给模型。',
        stem: '这些片段主要进入模型的哪一部分？',
        options: null,
        answer: '上下文窗口',
        acceptableAnswers: ['上下文窗口', 'context window'],
        answerHint: '一个模型能同时看到的输入范围',
        explanation:
          'RAG 的检索结果并不会改变模型参数，而是被组织进当前请求的上下文窗口，让模型在生成时参考这些材料。判断线索是：只影响本次回答的是上下文，长期改变模型行为才是训练或微调。',
        misconception: '把 RAG 检索片段误认为训练数据或模型参数更新。',
        extendedKnowledge:
          '这也是 RAG 与微调的关键区别之一：RAG 更像临时带资料回答，微调则改变模型内部权重。',
        distractors: [{ text: '训练集', type: 'C_WrongContext', used: false }],
        evaluationMode: 'semantic',
      },
    })

    expect(parsed.quiz.acceptableAnswers).toContain('上下文窗口')
    expect(parsed.quiz.evaluationMode).toBe('semantic')
  })

  it('rejects fill blank acceptable answers that omit the standard answer', () => {
    const result = quizSchema.safeParse({
      reasoning: 'private CoT',
      quiz: {
        id: 'concept-1:slot-3',
        conceptId: 'concept-1',
        ladderLevel: 2,
        expressionLevel: 3,
        interactionType: 'fill_blank',
        stem: '这些片段主要进入模型的哪一部分？',
        options: null,
        answer: '上下文窗口',
        acceptableAnswers: ['context window'],
        explanation:
          'RAG 的检索结果并不会改变模型参数，而是被组织进当前请求的上下文窗口，让模型在生成时参考这些材料。',
        distractors: [{ text: '训练集', type: 'C_WrongContext', used: false }],
      },
    })

    expect(result.success).toBe(false)
  })

  it('accepts enriched challenge quiz fields', () => {
    const parsed = challengeBatchSchema.parse({
      reasoning: 'private CoT',
      quizzes: [
        {
          id: 'challenge-1',
          conceptId: 'challenge',
          ladderLevel: 3,
          expressionLevel: 1,
          interactionType: 'choice',
          background:
            '一个团队同时使用向量检索、上下文拼接和人工评估来改进问答系统，需要判断哪一步影响本次回答。',
          stem: '哪项说法最准确？',
          options: [
            '检索材料影响本次上下文',
            '检索会直接改写模型权重',
            '评估会自动更新训练集',
            '向量库等同于提示词',
          ],
          answer: '检索材料影响本次上下文',
          explanation:
            '检索材料会被拼入本次上下文，因此影响当前生成，但不会直接改写模型权重。把检索和训练混为一谈是常见误区；判断线索是这一步是否只作用于当前请求。',
          misconception: '把检索增强误认为模型已经被重新训练。',
          extendedKnowledge:
            '真实系统里还会对检索片段排序、截断和去重，避免上下文窗口被低价值材料占满。',
          distractors: [{ text: '检索会直接改写模型权重', type: 'C_WrongContext', used: false }],
          involvedConceptIds: ['concept-1', 'concept-2'],
        },
        {
          id: 'challenge-2',
          conceptId: 'challenge',
          ladderLevel: 3,
          expressionLevel: 1,
          interactionType: 'choice',
          stem: '哪项体现了 RAG 和微调的差异？',
          options: ['RAG 作用于请求上下文', 'RAG 总会更新参数', '微调只改变向量库', '两者没有差异'],
          answer: 'RAG 作用于请求上下文',
          explanation:
            'RAG 把外部材料带入请求上下文，微调才会改变模型参数。下一次判断时，看变化是否长期固化在模型行为中。',
          distractors: [{ text: 'RAG 总会更新参数', type: 'C_WrongContext', used: false }],
          involvedConceptIds: ['concept-1', 'concept-2'],
        },
        {
          id: 'challenge-3',
          conceptId: 'challenge',
          ladderLevel: 3,
          expressionLevel: 2,
          interactionType: 'sorting',
          stem: '按 RAG 回答链路排序。',
          options: ['检索相关片段', '拼入上下文', '模型生成回答'],
          answer: '检索相关片段 > 拼入上下文 > 模型生成回答',
          explanation:
            'RAG 先根据问题检索材料，再把材料组织进上下文，最后由模型参考上下文生成回答。顺序线索是先找资料，再带资料回答。',
          distractors: [{ text: '先生成再检索', type: 'E_Misunderstanding', used: false }],
          involvedConceptIds: ['concept-1', 'concept-2'],
        },
      ],
    })

    expect(parsed.quizzes[0]?.extendedKnowledge).toContain('上下文窗口')
  })
})
