import { describe, expect, it } from 'vitest'

import type { Quiz } from '@/types/domain'

import { evaluateAnswer } from '../evaluate-answer'
import { evaluateAnswerAsync } from '../evaluate-answer'

const baseQuiz: Quiz = {
  id: 'quiz-1',
  conceptId: 'concept-1',
  ladderLevel: 1,
  expressionLevel: 1,
  interactionType: 'choice',
  stem: 'What is RAG?',
  options: ['Retrieval augmented generation', 'Random answer generation'],
  answer: 'Retrieval augmented generation',
  explanation: 'RAG retrieves relevant context before generation.',
  distractors: ['Random answer generation confuses retrieval with randomness.'],
}

describe('evaluateAnswer', () => {
  it('scores a matching choice answer locally', () => {
    const result = evaluateAnswer(baseQuiz, 'Retrieval augmented generation')

    expect(result).toMatchObject({
      score: 100,
      gaps: [],
      nextAction: 'advance',
    })
  })

  it('scores a non-matching choice answer locally', () => {
    const result = evaluateAnswer(baseQuiz, 'Random answer generation')

    expect(result.score).toBe(0)
    expect(result.nextAction).toBe('retry')
    expect(result.gaps).toEqual(['Random answer generation confuses retrieval with randomness.'])
  })

  it('evaluates sorting by comparing user order against options (not quiz.answer)', () => {
    // 真实编译产物：options 按正确顺序排列，answer 是 LLM 自由格式（如 → 拼接）
    const sortingQuiz: Quiz = {
      ...baseQuiz,
      interactionType: 'sorting',
      expressionLevel: 2,
      options: ['Retrieve', 'Augment', 'Generate'],
      // answer 格式与 options.join('\n') 不同——模拟真实 LLM 输出
      answer: 'Retrieve→Augment→Generate',
    }

    // 用户正确排序 → items.join('\n') === options.join('\n') → 正确
    expect(evaluateAnswer(sortingQuiz, ['Retrieve', 'Augment', 'Generate'].join('\n')).score).toBe(
      100,
    )
    // 用户错误排序 → 不匹配 → 错误
    expect(evaluateAnswer(sortingQuiz, ['Retrieve', 'Generate', 'Augment'].join('\n')).score).toBe(
      0,
    )
    // 即使 quiz.answer 格式与 userAnswer 不同，只要顺序对就判对
    expect(
      evaluateAnswer(sortingQuiz, ['Retrieve', 'Augment', 'Generate'].join('\n')).nextAction,
    ).toBe('advance')
  })

  it('uses fill-blank normalization for fill blank answers', () => {
    const fillBlankQuiz: Quiz = {
      ...baseQuiz,
      interactionType: 'fill_blank',
      expressionLevel: 3,
      options: null,
      answer: 'HTTP 2.0',
    }

    expect(evaluateAnswer(fillBlankQuiz, ' http  2.0 ').score).toBe(100)
    expect(evaluateAnswer(fillBlankQuiz, 'HTTP 1.1')).toMatchObject({
      score: 0,
      gaps: ['标准答案：HTTP 2.0'],
      nextAction: 'retry',
    })
  })

  it('uses acceptable fill-blank answer variants locally', async () => {
    const fillBlankQuiz: Quiz = {
      ...baseQuiz,
      interactionType: 'fill_blank',
      expressionLevel: 3,
      options: null,
      answer: '上下文窗口',
      acceptableAnswers: ['上下文窗口', 'context window'],
      evaluationMode: 'semantic',
    }

    const result = await evaluateAnswerAsync(fillBlankQuiz, 'Context Window')

    expect(result).toMatchObject({
      score: 100,
      nextAction: 'advance',
    })
  })
})
