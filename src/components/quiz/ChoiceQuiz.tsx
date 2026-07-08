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

interface ChoiceQuizProps {
  quiz: Quiz
  disabled: boolean
  onAnswer: (userAnswer: string) => void
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

export function ChoiceQuiz({ quiz, disabled, onAnswer }: ChoiceQuizProps) {
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

  return (
    <div className="space-y-4">
      {/* Stem */}
      <p className="text-base text-neutral-200 leading-relaxed">{quiz.stem}</p>

      {/* Options */}
      <div className="space-y-2">
        {shuffledOptions.map((option, i) => {
          const isSelected = selected === option
          return (
            <button
              key={option}
              onClick={() => !disabled && setSelected(option)}
              disabled={disabled}
              className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                isSelected
                  ? 'border-neutral-400 bg-neutral-800/50 text-neutral-100'
                  : 'border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900/50'
              } ${disabled ? 'cursor-default opacity-60' : ''}`}
            >
              <span className="text-xs text-neutral-600 mr-2">{String.fromCharCode(65 + i)}</span>
              {option}
            </button>
          )
        })}
      </div>

      {/* Submit */}
      {!disabled && (
        <button
          onClick={handleSubmit}
          disabled={selected === null}
          className="w-full py-2.5 rounded-lg bg-neutral-100 text-neutral-900 text-sm font-medium hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
        >
          确认选择
        </button>
      )}
    </div>
  )
}
