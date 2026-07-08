import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'
import type { Quiz } from '@/types/domain'

import { isFillBlankCorrect } from './fill-blank'

function buildFeedbackText(isCorrect: boolean): string {
  return isCorrect ? '答对！继续保持这个节奏。' : '再试一题，重点看解析里的关键关系。'
}

function buildGaps(quiz: Quiz, userAnswer: string): string[] {
  if (quiz.interactionType === 'fill_blank') {
    return [`标准答案：${quiz.answer}`]
  }

  const matchingDistractor = quiz.distractors.find((distractor) => distractor === userAnswer)
  const gaps = matchingDistractor ? [matchingDistractor] : quiz.distractors.slice(0, 2)

  return gaps.length > 0 ? gaps : ['回顾题目解析中的关键判断依据']
}

/**
 * Deterministic runtime quiz evaluation.
 *
 * Compile output already includes the canonical answer and explanation, so
 * closed-form quiz scoring must not depend on the feedback LLM.
 */
export function evaluateAnswer(quiz: Quiz, userAnswer: string): FeedbackRuntime {
  const isCorrect =
    quiz.interactionType === 'fill_blank'
      ? isFillBlankCorrect(userAnswer, quiz.answer)
      : userAnswer === quiz.answer

  return {
    score: isCorrect ? 100 : 0,
    gaps: isCorrect ? [] : buildGaps(quiz, userAnswer),
    nextAction: isCorrect ? 'advance' : 'retry',
    feedbackText: buildFeedbackText(isCorrect),
  }
}
