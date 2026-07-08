import { describe, expect, it } from 'vitest'

import type { Quiz } from '@/types/domain'

import { evaluateAnswer } from '../evaluate-answer'

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

  it('requires exact order for sorting answers', () => {
    const sortingQuiz: Quiz = {
      ...baseQuiz,
      interactionType: 'sorting',
      expressionLevel: 2,
      options: ['Retrieve', 'Augment', 'Generate'],
      answer: ['Retrieve', 'Augment', 'Generate'].join('\n'),
    }

    expect(evaluateAnswer(sortingQuiz, ['Retrieve', 'Augment', 'Generate'].join('\n')).score).toBe(
      100,
    )
    expect(evaluateAnswer(sortingQuiz, ['Retrieve', 'Generate', 'Augment'].join('\n')).score).toBe(
      0,
    )
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
})
