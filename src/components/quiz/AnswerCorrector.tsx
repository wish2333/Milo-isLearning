'use client'

import { useCallback, useMemo, useState } from 'react'

import type { Quiz } from '@/types/domain'

export type QuizEditPatch = Partial<
  Pick<
    Quiz,
    | 'answer'
    | 'options'
    | 'acceptableAnswers'
    | 'stem'
    | 'explanation'
    | 'distractors'
    | 'answerHint'
  >
>

interface AnswerCorrectorProps {
  quiz: Quiz
  onSave: (patch: QuizEditPatch) => void
  onCancel: () => void
}

/* ------------------------------------------------------------------ */
/* Choice editor (radio-only: click to select correct answer)           */
/* ------------------------------------------------------------------ */

function ChoiceEditor({
  options,
  selectedAnswer,
  onSelectAnswer,
}: {
  options: string[]
  selectedAnswer: string
  onSelectAnswer: (option: string) => void
}) {
  return (
    <div>
      <p className="text-xs text-fg-tertiary mb-2">指定正确答案（点击切换）</p>
      <div className="space-y-1" role="radiogroup" aria-label="选择正确答案">
        {options.map((option, i) => {
          const selected = selectedAnswer === option
          const letter = String.fromCharCode(65 + i)
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelectAnswer(option)}
              className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                selected
                  ? 'border border-[color:var(--success)]/50 bg-[color:var(--success-soft)]/30'
                  : 'border border-transparent hover:bg-bg-elevated'
              }`}
            >
              <span
                className={`text-sm ${
                  selected ? 'text-[color:var(--success)]' : 'text-fg-tertiary'
                }`}
              >
                {selected ? '●' : '○'}
              </span>
              <span className="text-sm font-medium text-fg-secondary">{letter}.</span>
              <span className="flex-1 text-sm text-fg-primary">{option}</span>
              {selected && (
                <span className="text-xs text-[color:var(--success)] shrink-0">✓ 当前正解</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sorting editor (arrow reorder)                                       */
/* ------------------------------------------------------------------ */

function SortingEditor({
  items,
  onMoveItem,
}: {
  items: string[]
  onMoveItem: (index: number, direction: 'up' | 'down') => void
}) {
  return (
    <div>
      <p className="text-xs text-fg-tertiary mb-1">使用箭头调整正确顺序（从上到下）</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          // eslint-disable-next-line react/no-array-index-key -- reorderable list needs stable positional key
          <div key={i} className="alc-option flex items-center gap-3 cursor-default">
            <span className="w-6 tabular-nums text-xs text-fg-tertiary">{i + 1}</span>
            <span className="flex-1 text-base text-fg-primary">{item}</span>
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => onMoveItem(i, 'up')}
                disabled={i === 0}
                className="text-fg-tertiary hover:text-fg-secondary disabled:opacity-30 text-xs leading-none"
                aria-label={`上移: ${item}`}
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => onMoveItem(i, 'down')}
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
/* Fill-blank editor (correct answer + acceptable answers only)         */
/* ------------------------------------------------------------------ */

function FillBlankEditor({
  primaryAnswer,
  setPrimaryAnswer,
  acceptableAnswers,
  setAcceptableAnswers,
}: {
  primaryAnswer: string
  setPrimaryAnswer: (v: string) => void
  acceptableAnswers: string[]
  setAcceptableAnswers: (v: string[]) => void
}) {
  const [extraInput, setExtraInput] = useState<string>(() =>
    acceptableAnswers.filter((a) => a !== primaryAnswer && a.trim() !== '').join(', '),
  )

  const handleExtraBlur = useCallback(() => {
    const parts = extraInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    setAcceptableAnswers(parts.filter((p) => p !== primaryAnswer))
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
/* Main component                                                       */
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

  // Validation error
  const [validationError, setValidationError] = useState<string | null>(null)

  // Sorting move helper
  const moveSortingItem = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= orderedItems.length) return
      const next = [...orderedItems]
      ;[next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!]
      setOrderedItems(next)
    },
    [orderedItems],
  )

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
    if (quiz.interactionType === 'fill_blank') {
      const allAnswers = [primaryAnswer, ...acceptableAnswers.filter((a) => a !== primaryAnswer)]
      if (allAnswers.every((a) => a.trim().length === 0)) {
        setValidationError('答案不能为空')
        return
      }
    }

    setValidationError(null)

    const patch: QuizEditPatch = {}

    switch (quiz.interactionType) {
      case 'choice': {
        if (selectedOption !== quiz.answer) patch.answer = selectedOption
        break
      }
      case 'sorting':
        if (orderedItems.join('\n') !== (quiz.options ?? []).join('\n')) {
          patch.answer = orderedItems.join('\n')
          patch.options = orderedItems
        }
        break
      case 'fill_blank':
        if (primaryAnswer !== quiz.answer) patch.answer = primaryAnswer
        patch.acceptableAnswers = [
          primaryAnswer,
          ...acceptableAnswers.filter((a) => a !== primaryAnswer),
        ]
        break
    }

    onSave(patch)
  }, [quiz, selectedOption, orderedItems, primaryAnswer, acceptableAnswers, onSave])

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-secondary">指定正确答案</p>

      {validationError && <p className="text-xs text-[var(--danger)]">{validationError}</p>}

      {quiz.interactionType === 'choice' && (
        <ChoiceEditor
          options={quiz.options ?? []}
          selectedAnswer={selectedOption}
          onSelectAnswer={setSelectedOption}
        />
      )}

      {quiz.interactionType === 'sorting' && (
        <SortingEditor items={orderedItems} onMoveItem={moveSortingItem} />
      )}

      {quiz.interactionType === 'fill_blank' && (
        <FillBlankEditor
          primaryAnswer={primaryAnswer}
          setPrimaryAnswer={setPrimaryAnswer}
          acceptableAnswers={acceptableAnswers}
          setAcceptableAnswers={setAcceptableAnswers}
        />
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!changed}
          className="alc-button-primary text-sm disabled:bg-bg-elevated disabled:text-fg-tertiary"
          aria-label="保存编辑"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="alc-button-secondary text-sm"
          aria-label="取消编辑"
        >
          取消
        </button>
      </div>
    </div>
  )
}
