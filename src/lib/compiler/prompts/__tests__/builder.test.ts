import { describe, expect, it } from 'vitest'

import { buildPrompt } from '../builder'
import { clearTemplateCache, setExpandedTemplate } from '../loader'
import type { AgentKind } from '@/lib/compiler/schemas'

/**
 * buildPrompt 测试
 *
 * 覆盖 M2 验收点（M1-Review §9：单 Agent 单测）的"模板渲染"维度：
 *   - 9 个 Agent 全部可构建（模板加载 + partial 展开 + schema 注入不抛错）
 *   - system / user 切分正确（恰好 2 条消息）
 *   - shared partial 展开（json-output-rules 内容进入 system）
 *   - schema 注入（对应 Agent 的字段名出现在 system）
 *   - 白名单变量替换（提供的 key 被替换；未提供的保持原样）
 *   - CJK 大括号示例文本不被误伤（distractor-rules 的 {正确原则} 保留）
 *   - 对象类型变量序列化为 JSON
 */

const ALL_KINDS: AgentKind[] = [
  'import',
  'chunk',
  'concept',
  'module',
  'mission',
  'quiz',
  'feynman',
  'feedback',
  'feynman-eval',
  'quiz-batch',
  'challenge-batch',
]

/** 每个 Agent 的最小可用输入（满足其模板占位符） */
const SAMPLE_INPUTS: Record<AgentKind, Record<string, unknown>> = {
  import: { rawMarkdown: '# RAG 入门\n\n检索增强生成是一种…' },
  chunk: { normalizedText: '# RAG\n\n检索增强生成（RAG）是一种结合检索与生成的技术。' },
  concept: {
    chunks: [
      { id: 'chunk-1', text: 'RAG 是检索增强生成…', heading: 'RAG' },
      { id: 'chunk-2', text: 'Embedding 是稠密向量表示…', heading: 'Embedding' },
    ],
    themeHint: '',
  },
  module: {
    concepts: [
      { id: 'concept-1', name: 'RAG', definition: '检索增强生成' },
      { id: 'concept-2', name: 'Embedding', definition: '稠密向量表示' },
    ],
    themeHint: '',
  },
  mission: {
    module: { id: 'module-1', title: '理解 RAG', goal: '解释 RAG' },
    concepts: [{ id: 'concept-1', name: 'RAG', definition: '检索增强生成' }],
    conceptId: 'concept-1',
  },
  quiz: {
    placeholder: {
      id: 'concept-1:slot-1',
      ladderLevel: 1,
      interactionType: 'choice',
      expressionLevel: 1,
    },
    concept: {
      id: 'concept-1',
      name: 'RAG',
      definition: '检索增强生成',
      keyPoints: ['检索', '生成'],
    },
    moduleContext: { title: '理解 RAG' },
    originalQuiz: null,
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
  },
  feynman: {
    module: { id: 'module-1', title: '理解 RAG', goal: '解释 RAG 是什么、为什么需要它' },
    concepts: [{ id: 'concept-1', name: 'RAG', definition: '检索增强生成' }],
  },
  feedback: {
    quiz: { stem: '下面哪一项是 RAG？', answer: '检索增强生成' },
    userAnswer: '一种数据库',
    attemptInfo: { attemptVersion: 0 },
  },
  'feynman-eval': {
    finalPrompt: '请用你自己的话解释 RAG',
    rubric: ['检索', '生成', '结合'],
    userOutput: 'RAG 是把检索和生成结合起来的技术…（示例输出）',
    point: '检索',
  },
  'quiz-batch': {
    placeholders: [
      { id: 'concept-1:slot-1', ladderLevel: 1, interactionType: 'choice', expressionLevel: 1 },
      { id: 'concept-1:slot-2', ladderLevel: 1, interactionType: 'choice', expressionLevel: 1 },
    ],
    concept: {
      id: 'concept-1',
      name: 'RAG',
      definition: '检索增强生成',
      keyPoints: ['检索', '生成'],
    },
    moduleContext: { title: '理解 RAG' },
    total: 2,
    conceptName: 'RAG',
    conceptId: 'concept-1',
  },
  'challenge-batch': {
    concepts: [
      { id: 'concept-1', name: 'RAG', definition: '检索增强生成', keyPoints: ['检索', '生成'] },
      {
        id: 'concept-2',
        name: 'Embedding',
        definition: '稠密向量表示',
        keyPoints: ['向量', '相似度'],
      },
    ],
    moduleContext: { title: '理解 RAG', intro: 'RAG 与 Embedding 的综合应用' },
    total: 3,
    conceptCount: 2,
  },
}

/** 取消息的 system / user 文本（内部已断言长度与角色，安全解包） */
function sysUser(
  kind: AgentKind,
  input: Record<string, unknown>,
): { system: string; user: string } {
  const msgs = buildPrompt(kind, input)
  const system = msgs[0]
  const user = msgs[1]
  if (!system || !user || system.role !== 'system' || user.role !== 'user') {
    throw new Error(`${kind} 应返回 [system, user] 两条消息`)
  }
  return { system: system.content, user: user.content }
}

describe('buildPrompt — 全 Agent 模板渲染', () => {
  it('10 个 Agent 全部可构建且返回恰好 [system, user] 两条消息', () => {
    for (const kind of ALL_KINDS) {
      const messages = buildPrompt(kind, SAMPLE_INPUTS[kind])
      expect(messages, `${kind} 应返回消息数组`).toHaveLength(2)
      expect(messages[0]?.role, `${kind} 第一条 role`).toBe('system')
      expect(messages[1]?.role, `${kind} 第二条 role`).toBe('user')
      expect(messages[0]?.content.length, `${kind} system 非空`).toBeGreaterThan(0)
      expect(messages[1]?.content.length, `${kind} user 非空`).toBeGreaterThan(0)
    }
  })

  it('system 段含 shared partial 展开内容（json-output-rules）', () => {
    const { system } = sysUser('import', SAMPLE_INPUTS.import)
    // json-output-rules.md 的标志性指令
    expect(system).toContain('只输出一个合法 JSON 对象')
    expect(system).toContain('不要使用 markdown 代码块包裹')
  })

  it('system 段注入了对应 Agent 的 JSON Schema（字段名可见）', () => {
    expect(sysUser('import', SAMPLE_INPUTS.import).system).toContain('normalizedText')

    const concept = sysUser('concept', SAMPLE_INPUTS.concept)
    expect(concept.system).toContain('concepts')
    expect(concept.system).toContain('parentChunkId')

    const feedback = sysUser('feedback', SAMPLE_INPUTS.feedback)
    expect(feedback.system).toContain('next_action')
    expect(feedback.system).toContain('feedback_text')
  })

  it('变量替换：提供的 key 被替换、字面占位符消失', () => {
    const { user } = sysUser('import', { rawMarkdown: 'UNIQUE_MARKER_12345' })
    expect(user).toContain('UNIQUE_MARKER_12345')
    expect(user).not.toContain('{rawMarkdown}')
  })

  it('对象类型变量序列化为 JSON 文本', () => {
    const { user } = sysUser('concept', SAMPLE_INPUTS.concept)
    expect(user).toContain('"id": "chunk-1"')
    expect(user).toContain('"heading": "RAG"')
  })

  it('白名单保护：distractor-rules 的 CJK 大括号示例不被误伤', () => {
    // quiz 引入 distractor-rules.md，其中含 {正确原则} 等 CJK 示例文本
    const { system } = sysUser('quiz', SAMPLE_INPUTS.quiz)
    expect(system).toContain('{正确原则}')
    expect(system).toContain('{已被取代的旧做法}')
  })

  it('未提供的 key 保持原样（调用方需显式传空串表示"无"）', () => {
    const { user } = sysUser('concept', { chunks: SAMPLE_INPUTS.concept.chunks })
    expect(user).toContain('{themeHint}')
  })

  it('显式传空串的 key 被替换为空（表示"无"）', () => {
    const { user } = sysUser('concept', { ...SAMPLE_INPUTS.concept, themeHint: '' })
    expect(user).not.toContain('{themeHint}')
  })

  it('quiz 在 retry 场景下 originalQuiz=null 时占位符消失', () => {
    const { user } = sysUser('quiz', { ...SAMPLE_INPUTS.quiz, originalQuiz: null })
    expect(user).not.toContain('{originalQuiz}')
  })

  it('quiz prompts include M7.6 pedagogy contracts and enriched fields', () => {
    const quiz = sysUser('quiz', SAMPLE_INPUTS.quiz).system
    const batch = sysUser('quiz-batch', SAMPLE_INPUTS['quiz-batch']).system
    const challenge = sysUser('challenge-batch', SAMPLE_INPUTS['challenge-batch']).system

    for (const system of [quiz, batch, challenge]) {
      expect(system).toContain('背景引导契约')
      expect(system).toContain('解析契约')
      expect(system).toContain('extendedKnowledge')
      expect(system).toContain('misconception')
    }
    expect(quiz).toContain('acceptableAnswers')
    expect(batch).toContain('answerHint')
  })

  it('模板缺少 ## System 或 ## User 时抛错（防模板编写错误）', () => {
    setExpandedTemplate('import', '# 只有标题\n\n没有 System/User 段')
    try {
      expect(() => buildPrompt('import', {})).toThrow(/System/)
    } finally {
      clearTemplateCache()
    }
  })
})
