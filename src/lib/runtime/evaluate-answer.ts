import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'
import type { LLMProvider } from '@/lib/providers'
import type { Quiz } from '@/types/domain'

import { isFillBlankAnswerAccepted } from './fill-blank'
import { evaluateSemanticAnswer } from './semantic-evaluation'

function buildFeedbackText(isCorrect: boolean): string {
  return isCorrect ? '答对！继续保持这个节奏。' : '再试一题，重点看解析里的关键关系。'
}

function buildGaps(quiz: Quiz, userAnswer: string): string[] {
  if (quiz.interactionType === 'fill_blank') {
    return [`标准答案：${quiz.answer}`]
  }

  if (quiz.interactionType === 'sorting') {
    const correctOrder = (quiz.options ?? []).join(' → ')
    return [`正确顺序：${correctOrder}`]
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
 *
 * Sorting 评估说明：prompt 要求 `options` 按**正确顺序**排列，但 LLM 生成的
 * `answer` 字段格式不固定（可能是 `→` 拼接或自由描述），与 SortingQuiz 提交的
 * `items.join('\n')` 格式不匹配。因此 sorting 正确性以 `options.join('\n')`
 * 为准（options 数组本身就是正解顺序）。
 */
export function evaluateAnswer(quiz: Quiz, userAnswer: string): FeedbackRuntime {
  const isCorrect =
    quiz.interactionType === 'fill_blank'
      ? isFillBlankAnswerAccepted(userAnswer, quiz.answer, quiz.acceptableAnswers)
      : quiz.interactionType === 'sorting'
        ? userAnswer === (quiz.options ?? []).join('\n')
        : userAnswer === quiz.answer

  return {
    score: isCorrect ? 100 : 0,
    gaps: isCorrect ? [] : buildGaps(quiz, userAnswer),
    nextAction: isCorrect ? 'advance' : 'retry',
    feedbackText: buildFeedbackText(isCorrect),
  }
}

export async function evaluateAnswerAsync(
  quiz: Quiz,
  userAnswer: string,
  provider?: LLMProvider | null,
): Promise<FeedbackRuntime> {
  if (quiz.interactionType !== 'fill_blank') {
    return evaluateAnswer(quiz, userAnswer)
  }

  const semantic = await evaluateSemanticAnswer({ quiz, userAnswer, provider })
  const isCorrect = semantic.accepted

  return {
    score: isCorrect ? 100 : 0,
    gaps: isCorrect ? [] : buildGaps(quiz, userAnswer),
    nextAction: isCorrect ? 'advance' : 'retry',
    feedbackText: isCorrect ? buildFeedbackText(true) : buildFeedbackText(false),
  }
}
