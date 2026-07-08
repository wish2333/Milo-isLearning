'use client'

/**
 * FillBlankQuiz — 填空题组件
 *
 * 对应 docs/M4-M5-Plan.md W4 / FR-03。
 * UI 参考：docs/ui-design/07-learn-fill-blank.html
 *
 * 交互：
 *   - 单个文本输入框（answer 是一个关键词或短语）
 *   - 提交后不可更改
 *   - 宽度自适应（DESIGN-SPEC §4.2.3）
 */

import { useState } from 'react'

import type { Quiz } from '@/types/domain'

interface FillBlankQuizProps {
  quiz: Quiz
  disabled: boolean
  onAnswer: (userAnswer: string) => void
}

export function FillBlankQuiz({ quiz, disabled, onAnswer }: FillBlankQuizProps) {
  const [value, setValue] = useState('')

  const handleSubmit = () => {
    if (!value.trim() || disabled) return
    onAnswer(value.trim())
  }

  // 把 stem 中的 ____（下划线占位符）替换为 input
  const parts = quiz.stem.split(/_{2,}/)

  return (
    <div className="space-y-4">
      {/* Stem with inline input */}
      <div className="text-base text-neutral-200 leading-relaxed">
        {parts.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            {parts.map((part, i) => (
              <span key={part.slice(0, 16)}>
                {part}
                {i < parts.length - 1 && (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    disabled={disabled}
                    placeholder="填写..."
                    className={`inline-block mx-1 px-2 py-0.5 bg-neutral-900 border-b-2 ${
                      disabled
                        ? 'border-neutral-700'
                        : 'border-neutral-500 focus:border-neutral-300'
                    } text-neutral-100 text-base outline-none transition-colors text-center min-w-[80px]`}
                    style={{ width: `${Math.max(value.length, 4) + 2}ch` }}
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
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              disabled={disabled}
              placeholder="输入你的答案..."
              className="w-full px-3 py-2.5 bg-neutral-900 border border-neutral-800 rounded-lg text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 text-sm"
            />
          </>
        )}
      </div>

      {/* Submit */}
      {!disabled && (
        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="w-full py-2.5 rounded-lg bg-neutral-100 text-neutral-900 text-sm font-medium hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
        >
          确认答案
        </button>
      )}
    </div>
  )
}
