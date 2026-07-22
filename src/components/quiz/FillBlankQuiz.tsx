'use client'

/**
 * FillBlankQuiz — 填空题组件
 *
 * 对应 docs/M4-M5-Plan.md W4 / FR-03。
 * UI 参考：docs/ui-design/07-learn-fill-blank.html
 *
 * 交互：
 *   - 支持 stem 中多个 ____ 占位符，每个对应一个独立 input
 *   - 单个 ____ 时渲染整行 input；多个时渲染行内 input
 *   - 提交后不可更改
 *   - 宽度自适应（DESIGN-SPEC §4.2.3）
 *   - 多空答案用 \n 连接为 userAnswer
 */

import { useState, useEffect } from 'react'

import type { Quiz } from '@/types/domain'

import { QuizActionBar } from './QuizActionBar'

interface FillBlankQuizProps {
  quiz: Quiz
  disabled: boolean
  onAnswer: (userAnswer: string) => void
}

export function FillBlankQuiz({ quiz, disabled, onAnswer }: FillBlankQuizProps) {
  // 把 stem 中的 ____（下划线占位符）替换为 input
  const parts = quiz.stem.split(/_{2,}/)
  const blankCount = Math.max(parts.length - 1, 1)

  // 多空模式：每个空一个独立 input，values[i] 对应第 i 个空
  const [values, setValues] = useState<string[]>(() => Array.from({ length: blankCount }, () => ''))

  // quiz 变化时（如 retry 换题）重置 values 以匹配新的 blank 数量
  useEffect(() => {
    setValues(Array.from({ length: blankCount }, () => ''))
  }, [blankCount])

  const handleChange = (index: number, val: string) => {
    setValues((prev) => {
      const next = [...prev]
      next[index] = val
      return next
    })
  }

  const handleSubmit = () => {
    if (disabled) return
    const trimmed = values.map((v) => v.trim())
    if (trimmed.some((v) => !v)) return
    onAnswer(trimmed.join('\n'))
  }

  const allFilled = values.every((v) => v.trim())

  return (
    <div className="space-y-4">
      {/* Stem with inline input */}
      <div className="alc-question-stem">
        {quiz.answerHint && (
          <p className="mb-3 text-xs text-fg-tertiary">提示：{quiz.answerHint}</p>
        )}
        {parts.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            {parts.map((part, i) => (
              <span key={`${part.length}-${part.slice(0, 12)}`}>
                {part}
                {i < parts.length - 1 && (
                  <input
                    type="text"
                    value={values[i] ?? ''}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    disabled={disabled}
                    placeholder="填写..."
                    className={`inline-block mx-1 px-2 py-0.5 bg-bg-surface border-b-2 ${
                      disabled
                        ? 'border-border-strong'
                        : 'border-border-default focus:border-accent-primary'
                    } text-fg-primary text-base outline-none transition-colors text-center min-w-[80px]`}
                    style={{ width: `${Math.max(values[i]?.length ?? 0, 4) + 2}ch` }}
                  />
                )}
              </span>
            ))}
          </div>
        ) : (
          <>
            <p className="mb-3">{quiz.stem}</p>
            <input
              type="text"
              value={values[0] ?? ''}
              onChange={(e) => handleChange(0, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              disabled={disabled}
              placeholder="输入你的答案..."
              className="w-full px-3 py-2.5 bg-bg-surface border border-border-default rounded-lg text-fg-primary placeholder-fg-tertiary focus:outline-none focus:border-border-default text-sm"
            />
          </>
        )}
      </div>

      {/* Submit */}
      {!disabled && (
        <QuizActionBar>
          <button
            onClick={handleSubmit}
            disabled={!allFilled}
            className="alc-button-primary w-full disabled:bg-bg-elevated disabled:text-fg-tertiary"
          >
            确认答案
          </button>
        </QuizActionBar>
      )}
    </div>
  )
}
