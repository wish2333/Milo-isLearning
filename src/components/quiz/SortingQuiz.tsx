'use client'

/**
 * SortingQuiz — 排序题组件
 *
 * 对应 docs/M4-M5-Plan.md W4 / FR-03。
 * UI 参考：docs/ui-design/06-learn-sorting.html
 *
 * 交互：
 *   - 3-5 项可拖拽排序（桌面）/ 上下箭头（移动端）
 *   - 提交后不可更改
 *   - 用户排序结果用 \n 连接为字符串作为 userAnswer
 */

import { useMemo, useRef, useState } from 'react'

import type { Quiz } from '@/types/domain'

import { QuizActionBar } from './QuizActionBar'

interface SortingQuizProps {
  quiz: Quiz
  disabled: boolean
  onAnswer: (userAnswer: string) => void
}

export function SortingQuiz({ quiz, disabled, onAnswer }: SortingQuizProps) {
  // 拖拽状态守卫：拖拽期间禁用 arrow 按钮，防止 items 数组变化导致 stale index
  const draggingRef = useRef(false)

  // 初始顺序随机打乱（原 options 顺序是正解）
  const [items, setItems] = useState<string[]>(() => {
    if (!quiz.options) return []
    const shuffled = [...quiz.options]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
    }
    return shuffled
  })

  const canSubmit = useMemo(() => items.length > 0, [items])

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (disabled || draggingRef.current) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= items.length) return
    const newItems = [...items]
    ;[newItems[index], newItems[targetIndex]] = [newItems[targetIndex]!, newItems[index]!]
    setItems(newItems)
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index))
    draggingRef.current = true
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (disabled) return
    draggingRef.current = false
    const sourceIndex = Number(e.dataTransfer.getData('text/plain'))
    if (sourceIndex === targetIndex) return
    const newItems = [...items]
    const [moved] = newItems.splice(sourceIndex, 1)
    if (moved) {
      newItems.splice(targetIndex, 0, moved)
      setItems(newItems)
    }
  }

  const handleSubmit = () => {
    if (!canSubmit || disabled) return
    // 用户排序结果用换行连接
    onAnswer(items.join('\n'))
  }

  return (
    <div className="space-y-4">
      {/* Stem */}
      <p className="alc-question-stem">{quiz.stem}</p>
      <p className="text-xs text-fg-tertiary">拖拽或使用箭头调整顺序（从上到下）</p>

      {/* Sortable items */}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={item}
            draggable={!disabled}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragEnd={() => {
              draggingRef.current = false
            }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, i)}
            className={`alc-option flex items-center gap-3 ${
              disabled ? 'cursor-default' : 'cursor-move'
            }`}
          >
            <span className="w-6 tabular-nums text-xs text-fg-tertiary">{i + 1}</span>
            <span className="flex-1 text-base text-fg-primary">{item}</span>
            {!disabled && (
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveItem(i, 'up')}
                  disabled={i === 0}
                  className="text-fg-tertiary hover:text-fg-secondary disabled:opacity-30 text-xs leading-none"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveItem(i, 'down')}
                  disabled={i === items.length - 1}
                  className="text-fg-tertiary hover:text-fg-secondary disabled:opacity-30 text-xs leading-none"
                >
                  ▼
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Submit */}
      {!disabled && (
        <QuizActionBar>
          <button onClick={handleSubmit} className="alc-button-primary w-full">
            确认排序
          </button>
        </QuizActionBar>
      )}
    </div>
  )
}
