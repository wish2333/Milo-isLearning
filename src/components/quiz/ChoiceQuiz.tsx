'use client'

/**
 * ChoiceQuiz — 4 选项单选题组件
 *
 * 对应 docs/M4-M5-Plan.md W4 / FR-03。
 * UI 参考：docs/ui-design/05-learn-choice.html
 *
 * 交互：
 *   - 4 选项点击选择（单选）
 *   - 提交后不可更改
 *   - 选项打乱（options[0] 是正解，前端 shuffle）
 */

import { useMemo, useState } from 'react'

import type { Quiz } from '@/types/domain'

import { QuizActionBar } from './QuizActionBar'

interface ChoiceQuizProps {
  quiz: Quiz
  disabled: boolean
  onAnswer: (userAnswer: string) => void
  /** 提交后的用户答案，用于三态视觉标记（正解/错选/未选） */
  submittedAnswer?: string
}

/** Fisher-Yates shuffle（稳定，不修改原数组） */
function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

export function ChoiceQuiz({ quiz, disabled, onAnswer, submittedAnswer }: ChoiceQuizProps) {
  // quiz.options[0] 是正解，打乱后渲染
  const shuffledOptions = useMemo(() => {
    if (!quiz.options) return []
    return shuffle(quiz.options)
  }, [quiz.options])

  const [selected, setSelected] = useState<string | null>(null)

  const handleSubmit = () => {
    if (selected === null || disabled) return
    onAnswer(selected)
  }

  // 兼容未透传 submittedAnswer 的旧入口：提交回调发生后，selected 仍保留用户选择，
  // 因此也可以用它渲染“正解 + 用户错选”的三态反馈。
  const resolvedSubmittedAnswer = submittedAnswer ?? selected
  const isSubmitted = disabled && resolvedSubmittedAnswer !== null

  return (
    <div className="space-y-4">
      {/* Stem */}
      <p className="alc-question-stem">{quiz.stem}</p>

      {/* Options */}
      <div className="space-y-2">
        {shuffledOptions.map((option, i) => {
          const isSelected = selected === option
          const isCorrectAnswer = isSubmitted && option === quiz.answer
          const isUserWrong =
            isSubmitted && option === resolvedSubmittedAnswer && option !== quiz.answer

          let optionClassName = 'alc-option w-full text-left text-base flex items-center gap-2 '
          if (isSubmitted) {
            if (isCorrectAnswer) {
              optionClassName += 'border-success/60 bg-success-soft/40 text-success'
            } else if (isUserWrong) {
              optionClassName += 'border-warning/50 bg-warning-soft/30 text-warning'
            } else {
              optionClassName += 'opacity-50'
            }
          } else {
            optionClassName += disabled ? 'cursor-default opacity-60' : ''
          }

          return (
            <button
              key={option}
              onClick={() => !disabled && setSelected(option)}
              disabled={disabled}
              className={optionClassName}
              data-selected={isSelected ? 'true' : undefined}
            >
              <span className="mr-2 text-xs text-fg-tertiary shrink-0">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1">{option}</span>
              {isCorrectAnswer && (
                <span className="ml-auto shrink-0" aria-label="正确答案">
                  ✓
                </span>
              )}
              {isUserWrong && (
                <span className="ml-auto shrink-0" aria-label="你的选择">
                  ✗
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Submit */}
      {!disabled && (
        <QuizActionBar>
          <button
            onClick={handleSubmit}
            disabled={selected === null}
            className="alc-button-primary w-full disabled:bg-bg-elevated disabled:text-fg-tertiary"
          >
            确认选择
          </button>
        </QuizActionBar>
      )}
    </div>
  )
}
