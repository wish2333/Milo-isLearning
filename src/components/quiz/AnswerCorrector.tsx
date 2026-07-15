'use client'

/**
 * AnswerCorrector -- per-type quiz answer correction UI.
 *
 * Dispatches by quiz.interactionType to render the appropriate editor.
 * Arrow-reorder for sorting (no DnD dependency).
 * Disables save when unchanged from original.
 *
 * v1.1.1 F40 -- manual answer correction leaf component.
 */

import { useCallback, useMemo, useState } from 'react'

import type { Quiz } from '@/types/domain'

interface AnswerCorrectorProps {
  quiz: Quiz
  onSave: (patch: Partial<Pick<Quiz, 'answer' | 'options' | 'acceptableAnswers'>>) => void
  onCancel: () => void
}

/* ------------------------------------------------------------------ */
/* Choice editor                                                       */
/* ------------------------------------------------------------------ */

function ChoiceEditor({
  quiz,
  answer,
  setAnswer,
}: {
  quiz: Quiz
  answer: string
  setAnswer: (v: string) => void
}) {
  const options = quiz.options ?? []
  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-tertiary">点击选择正确答案</p>
      <div className="space-y-2">
        {options.map((option, i) => {
          const selected = answer === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => setAnswer(option)}
              data-selected={selected ? 'true' : undefined}
              className="alc-option w-full text-left text-base"
              aria-label={`选项 ${String.fromCharCode(65 + i)}: ${option}${selected ? '（已选中）' : ''}`}
              aria-pressed={selected}
            >
              <span className="mr-2 text-xs text-fg-tertiary">{String.fromCharCode(65 + i)}</span>
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sorting editor (arrow reorder)                                      */
/* ------------------------------------------------------------------ */

function SortingEditor({ items, setItems }: { items: string[]; setItems: (v: string[]) => void }) {
  const moveItem = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= items.length) return
      const next = [...items]
      ;[next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!]
      setItems(next)
    },
    [items, setItems],
  )

  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-tertiary">使用箭头调整正确顺序（从上到下）</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          // eslint-disable-next-line react/no-array-index-key -- reorderable list needs stable positional key
          <div key={i} className="alc-option flex items-center gap-3 cursor-default">
            <span className="w-6 tabular-nums text-xs text-fg-tertiary">{i + 1}</span>
            <span className="flex-1 text-base text-fg-primary">{item}</span>
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => moveItem(i, 'up')}
                disabled={i === 0}
                className="text-fg-tertiary hover:text-fg-secondary disabled:opacity-30 text-xs leading-none"
                aria-label={`上移: ${item}`}
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveItem(i, 'down')}
                disabled={i === items.length - 1}
                className="text-fg-tertiary hover:text-fg-secondary disabled:opacity-30 text-xs leading-none"
                aria-label={`下移: ${item}`}
              >
                ▼
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fill-blank editor                                                   */
/* ------------------------------------------------------------------ */

function FillBlankEditor({
  quiz,
  primaryAnswer,
  setPrimaryAnswer,
  setAcceptableAnswers,
}: {
  quiz: Quiz
  primaryAnswer: string
  setPrimaryAnswer: (v: string) => void
  setAcceptableAnswers: (v: string[]) => void
}) {
  const [extraInput, setExtraInput] = useState(() => {
    // Exclude the primary answer from acceptableAnswers for the extra-input display
    const extras = (quiz.acceptableAnswers ?? []).filter(
      (a) => a !== quiz.answer && a.trim() !== '',
    )
    return extras.join(', ')
  })

  const handleExtraBlur = useCallback(() => {
    const parts = extraInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    // Deduplicate with primary answer
    const filtered = parts.filter((p) => p !== primaryAnswer)
    setAcceptableAnswers(filtered)
  }, [extraInput, primaryAnswer, setAcceptableAnswers])

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="corrector-primary" className="block text-xs text-fg-tertiary mb-1">
          正确答案
        </label>
        <input
          id="corrector-primary"
          type="text"
          value={primaryAnswer}
          onChange={(e) => setPrimaryAnswer(e.target.value)}
          className="alc-input"
          placeholder="输入正确答案"
          aria-label="正确答案"
        />
      </div>
      <div>
        <label htmlFor="corrector-extra" className="block text-xs text-fg-tertiary mb-1">
          其他可接受答案（英文逗号分隔）
        </label>
        <input
          id="corrector-extra"
          type="text"
          value={extraInput}
          onChange={(e) => setExtraInput(e.target.value)}
          onBlur={handleExtraBlur}
          className="alc-input"
          placeholder="如: 答案A, 答案B"
          aria-label="其他可接受答案"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function AnswerCorrector({ quiz, onSave, onCancel }: AnswerCorrectorProps) {
  // Choice state
  const [selectedOption, setSelectedOption] = useState<string>(quiz.answer)

  // Sorting state
  const [orderedItems, setOrderedItems] = useState<string[]>(() => [...(quiz.options ?? [])])

  // Fill-blank state
  const [primaryAnswer, setPrimaryAnswer] = useState<string>(quiz.answer)
  const [acceptableAnswers, setAcceptableAnswers] = useState<string[]>(() => [
    ...(quiz.acceptableAnswers ?? []),
  ])

  // Compute changed
  const changed = useMemo(() => {
    switch (quiz.interactionType) {
      case 'choice':
        return selectedOption !== quiz.answer
      case 'sorting':
        return orderedItems.join('\n') !== (quiz.options ?? []).join('\n')
      case 'fill_blank': {
        const origExtras = (quiz.acceptableAnswers ?? []).filter((a) => a !== quiz.answer)
        const newExtras = acceptableAnswers.filter((a) => a !== primaryAnswer)
        return primaryAnswer !== quiz.answer || origExtras.join(',') !== newExtras.join(',')
      }
    }
  }, [quiz, selectedOption, orderedItems, primaryAnswer, acceptableAnswers])

  const handleSave = useCallback(() => {
    switch (quiz.interactionType) {
      case 'choice':
        onSave({ answer: selectedOption })
        break
      case 'sorting':
        onSave({ answer: orderedItems.join('\n'), options: orderedItems })
        break
      case 'fill_blank':
        onSave({
          answer: primaryAnswer,
          acceptableAnswers: [
            primaryAnswer,
            ...acceptableAnswers.filter((a) => a !== primaryAnswer),
          ],
        })
        break
    }
  }, [quiz.interactionType, selectedOption, orderedItems, primaryAnswer, acceptableAnswers, onSave])

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-secondary">修正答案</p>

      {quiz.interactionType === 'choice' && (
        <ChoiceEditor quiz={quiz} answer={selectedOption} setAnswer={setSelectedOption} />
      )}

      {quiz.interactionType === 'sorting' && (
        <SortingEditor items={orderedItems} setItems={setOrderedItems} />
      )}

      {quiz.interactionType === 'fill_blank' && (
        <FillBlankEditor
          quiz={quiz}
          primaryAnswer={primaryAnswer}
          setPrimaryAnswer={setPrimaryAnswer}
          setAcceptableAnswers={setAcceptableAnswers}
        />
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!changed}
          className="alc-button-primary text-sm disabled:bg-bg-elevated disabled:text-fg-tertiary"
          aria-label="保存修正"
        >
          保存修正
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="alc-button-secondary text-sm"
          aria-label="取消修正"
        >
          取消
        </button>
      </div>
    </div>
  )
}
