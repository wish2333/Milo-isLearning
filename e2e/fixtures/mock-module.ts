/**
 * Mock Module fixture for E2E tests
 *
 * A minimal valid Module with 1 concept (2 quizzes) + 6-step Feynman task.
 * Used by the SSE mock for /api/compile.
 */

// Type-only import (erased at compile time, safe for Playwright transpiler)
import type { Module } from '../../src/types/domain'

export const mockModule: Module = {
  id: 'module-test-1',
  sourceId: 'source-test-1',
  title: '测试模块',
  intro: '这是一个用于 E2E 测试的模块',
  goal: '验证学习流程',
  concepts: [
    {
      id: 'concept-1',
      moduleId: 'module-test-1',
      name: '核心概念',
      definition: '测试用的核心概念定义',
      type: 'fact',
      keyPoints: ['要点一', '要点二'],
      quizSeries: {
        conceptId: 'concept-1',
        quizzes: [
          {
            id: 'concept-1:0',
            conceptId: 'concept-1',
            ladderLevel: 1,
            expressionLevel: 1,
            interactionType: 'choice',
            stem: '下面哪一项是核心概念的定义？',
            options: ['正确答案', '干扰项A', '干扰项B', '干扰项C'],
            answer: '正确答案',
            explanation: '正确答案是核心概念的标准定义，其他选项属于相邻领域的混淆概念。',
            distractors: ['干扰项A', '干扰项B', '干扰项C'],
          },
          {
            id: 'concept-1:1',
            conceptId: 'concept-1',
            ladderLevel: 1,
            expressionLevel: 1,
            interactionType: 'choice',
            stem: '核心概念的关键要点是什么？',
            options: ['要点一和要点二', '要点三', '要点四', '要点五'],
            answer: '要点一和要点二',
            explanation: '核心概念包含要点一和要点二，其他选项不在范围内。',
            distractors: ['要点三', '要点四', '要点五'],
          },
        ],
      },
      order: 1,
    },
  ],
  feynmanTask: {
    moduleId: 'module-test-1',
    steps: [
      {
        order: 1,
        type: 'choice',
        stem: '费曼步骤1：核心概念属于哪个领域？',
        options: ['正确领域', '错误领域A', '错误领域B', '错误领域C'],
        answer: '正确领域',
        explanation: '核心概念属于正确领域。',
      },
      {
        order: 2,
        type: 'choice',
        stem: '费曼步骤2：核心概念的主要用途？',
        options: ['主要用途', '次要用途A', '次要用途B', '次要用途C'],
        answer: '主要用途',
        explanation: '核心概念的主要用途是这个。',
      },
      {
        order: 3,
        type: 'choice',
        stem: '费曼步骤3：核心概念的关键特征？',
        options: ['关键特征', '特征A', '特征B', '特征C'],
        answer: '关键特征',
        explanation: '关键特征是区分核心概念的重要标志。',
      },
      {
        order: 4,
        type: 'choice',
        stem: '费曼步骤4：哪个描述最准确？',
        options: ['准确描述', '不够准确A', '不够准确B', '完全错误C'],
        answer: '准确描述',
        explanation: '这个描述完整涵盖了核心概念的内涵。',
      },
      {
        order: 5,
        type: 'fill_blank',
        stem: '费曼步骤5：核心概念的关键术语是____',
        options: null,
        answer: '关键术语',
        explanation: '关键术语是核心概念的标志性词汇。',
      },
    ],
    finalPrompt: '请用你自己的话完整解释核心概念。',
    rubric: ['概念定义准确', '关键要点完整', '应用场景清晰'],
  },
  order: 1,
}

/** Canned feedback responses */
export const mockFeedbackPass = {
  score: 100,
  gaps: [],
  nextAction: 'advance',
  feedbackText: '答得不错，继续加油！',
}

export const mockFeedbackFail = {
  score: 0,
  gaps: ['注意区分核心概念的特征'],
  nextAction: 'retry',
  feedbackText: '差一点，关键在于核心概念的特征。',
}

export const mockFeedbackPassAfterRetry = {
  score: 100,
  gaps: [],
  nextAction: 'advance',
  feedbackText: '这次理解到位了！',
}

/** Canned replacement quiz for retry */
export const mockReplacementQuiz = {
  id: 'concept-1:0-retry-1',
  conceptId: 'concept-1',
  ladderLevel: 1,
  expressionLevel: 1,
  interactionType: 'choice' as const,
  stem: '重新出题：核心概念的定义是什么？',
  options: ['正确答案', '新干扰项A', '新干扰项B', '新干扰项C'],
  answer: '正确答案',
  explanation: '正确答案不变，但题目表述和干扰项已更换。',
  distractors: ['新干扰项A', '新干扰项B', '新干扰项C'],
}

/** Canned feynman-eval response */
export const mockFeynmanEval = {
  reasoning: '用户输出覆盖了核心要点',
  score: 67,
  rubricResults: [
    { point: '概念定义准确', hit: 'full' as const, comment: '定义表述清晰准确，理解到位。' },
    { point: '关键要点完整', hit: 'full' as const, comment: '两个要点都已覆盖，理解全面。' },
    { point: '应用场景清晰', hit: 'none' as const, comment: '缺少具体应用场景的说明。' },
  ],
  gaps: ['应用场景清晰'],
  sampleAnswer:
    '核心概念是指将离散信息映射到连续空间的方法。它包含要点一（向量表示）和要点二（相似度计算）两个关键组成部分。' +
    '在实际应用中，这种方法广泛用于搜索、推荐和分类等场景。理解核心概念的关键在于掌握其数学基础和工程实现。',
}
