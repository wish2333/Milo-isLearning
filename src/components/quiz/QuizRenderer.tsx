'use client'

/**
 * QuizRenderer — 根据 interactionType 分发到具体 Quiz 组件
 *
 * 对应 docs/M4-M5-Plan.md W4。
 */

import type { Quiz } from '@/types/domain'

import { ChoiceQuiz } from './ChoiceQuiz'
import { SortingQuiz } from './SortingQuiz'
import { FillBlankQuiz } from './FillBlankQuiz'

interface QuizRendererProps {
  quiz: Quiz
  disabled: boolean
  onAnswer: (userAnswer: string) => void
}

export function QuizRenderer({ quiz, disabled, onAnswer }: QuizRendererProps) {
  switch (quiz.interactionType) {
    case 'choice':
      return <ChoiceQuiz quiz={quiz} disabled={disabled} onAnswer={onAnswer} />
    case 'sorting':
      return <SortingQuiz quiz={quiz} disabled={disabled} onAnswer={onAnswer} />
    case 'fill_blank':
      return <FillBlankQuiz quiz={quiz} disabled={disabled} onAnswer={onAnswer} />
    default:
      return <p className="text-red-400 text-sm">不支持的题型: {quiz.interactionType}</p>
  }
}
