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
/* Shared fields                                                        */
/* ------------------------------------------------------------------ */

function StemField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-fg-tertiary mb-1">题干</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="alc-input min-h-[60px] resize-y"
        rows={2}
        aria-label="题干"
      />
    </div>
  )
}

function ExplanationField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-fg-tertiary mb-1">解析</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="alc-input min-h-[60px] resize-y"
        rows={2}
        aria-label="解析"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Choice editor                                                        */
/* ------------------------------------------------------------------ */

function ChoiceEditor({
  options,
  selectedAnswer,
  onSelectAnswer,
  onUpdateOptionText,
  onRemoveOption,
  onAddOption,
  optionCount,
}: {
  options: string[]
  selectedAnswer: string
  onSelectAnswer: (option: string) => void
  onUpdateOptionText: (index: number, text: string) => void
  onRemoveOption: (index: number) => void
  onAddOption: () => void
  optionCount: number
}) {
  return (
    <div>
      <p className="text-xs text-fg-tertiary mb-1">选项（点击字母设为正确答案）</p>
      <div className="space-y-2">
        {options.map((option, i) => {
          const selected = selectedAnswer === option
          return (
            // eslint-disable-next-line react/no-array-index-key -- editable options list needs stable positional key
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectAnswer(option)}
                data-selected={selected ? 'true' : undefined}
                className="alc-option shrink-0 w-8 h-8 flex items-center justify-center text-xs font-medium"
                aria-label={`设为正确答案: 选项 ${String.fromCharCode(65 + i)}`}
                aria-pressed={selected}
              >
                {selected ? '●' : String.fromCharCode(65 + i)}
              </button>
              <input
                type="text"
                value={option}
                onChange={(e) => onUpdateOptionText(i, e.target.value)}
                className="alc-input flex-1"
                aria-label={`选项 ${String.fromCharCode(65 + i)} 内容`}
              />
              {optionCount > 2 && (
                <button
                  type="button"
                  onClick={() => onRemoveOption(i)}
                  className="text-xs text-fg-quaternary hover:text-[color:var(--danger)] transition-colors shrink-0"
                  aria-label={`删除选项 ${String.fromCharCode(65 + i)}`}
                >
                  删除
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onAddOption}
        className="mt-2 text-xs text-fg-tertiary hover:text-fg-secondary transition-colors"
      >
        + 添加选项
      </button>
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
/* Fill-blank editor                                                    */
/* ------------------------------------------------------------------ */

function FillBlankEditor({
  primaryAnswer,
  setPrimaryAnswer,
  extraInput,
  setExtraInput,
  handleExtraBlur,
  answerHint,
  setAnswerHint,
}: {
  primaryAnswer: string
  setPrimaryAnswer: (v: string) => void
  extraInput: string
  setExtraInput: (v: string) => void
  handleExtraBlur: () => void
  answerHint: string
  setAnswerHint: (v: string) => void
}) {
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
      <div>
        <label htmlFor="corrector-hint" className="block text-xs text-fg-tertiary mb-1">
          答案提示
        </label>
        <input
          id="corrector-hint"
          type="text"
          value={answerHint}
          onChange={(e) => setAnswerHint(e.target.value)}
          className="alc-input"
          placeholder="可选：填写语境提示"
          aria-label="答案提示"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                       */
/* ------------------------------------------------------------------ */

export function AnswerCorrector({ quiz, onSave, onCancel }: AnswerCorrectorProps) {
  // Shared editable fields
  const [stem, setStem] = useState<string>(quiz.stem)
  const [explanation, setExplanation] = useState<string>(quiz.explanation)

  // Choice state
  const [selectedOption, setSelectedOption] = useState<string>(quiz.answer)
  const [choiceOptions, setChoiceOptions] = useState<string[]>(() => [...(quiz.options ?? [])])

  // Sorting state
  const [orderedItems, setOrderedItems] = useState<string[]>(() => [...(quiz.options ?? [])])

  // Fill-blank state
  const [primaryAnswer, setPrimaryAnswer] = useState<string>(quiz.answer)
  const [acceptableAnswers, setAcceptableAnswers] = useState<string[]>(() => [
    ...(quiz.acceptableAnswers ?? []),
  ])
  const [answerHint, setAnswerHint] = useState<string>(quiz.answerHint ?? '')
  const [extraInput, setExtraInput] = useState<string>(() => {
    const extras = (quiz.acceptableAnswers ?? []).filter(
      (a) => a !== quiz.answer && a.trim() !== '',
    )
    return extras.join(', ')
  })

  // Validation error
  const [validationError, setValidationError] = useState<string | null>(null)

  // Choice option helpers
  const updateChoiceOptionText = useCallback((index: number, text: string) => {
    setChoiceOptions((prev) => {
      const next = [...prev]
      next[index] = text
      return next
    })
  }, [])

  const removeChoiceOption = useCallback(
    (index: number) => {
      setChoiceOptions((prev) => {
        if (prev.length <= 2) return prev
        const removedText = prev[index]
        const next = prev.filter((_, i) => i !== index)
        if (removedText !== undefined && selectedOption === removedText) {
          setSelectedOption('')
        }
        return next
      })
    },
    [selectedOption],
  )

  const addChoiceOption = useCallback(() => {
    setChoiceOptions((prev) => [...prev, ''])
  }, [])

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

  // Fill-blank extra answer blur
  const handleExtraBlur = useCallback(() => {
    const parts = extraInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    const filtered = parts.filter((p) => p !== primaryAnswer)
    setAcceptableAnswers(filtered)
  }, [extraInput, primaryAnswer])

  // Compute changed
  const changed = useMemo(() => {
    const stemChanged = stem !== quiz.stem
    const explanationChanged = explanation !== quiz.explanation
    const hintChanged = answerHint !== (quiz.answerHint ?? '')

    switch (quiz.interactionType) {
      case 'choice': {
        if (stemChanged || explanationChanged || hintChanged) return true
        if (selectedOption !== quiz.answer) return true
        const origOptions = quiz.options ?? []
        if (choiceOptions.length !== origOptions.length) return true
        return choiceOptions.some((opt, i) => opt !== origOptions[i])
      }
      case 'sorting': {
        if (stemChanged || explanationChanged) return true
        return orderedItems.join('\n') !== (quiz.options ?? []).join('\n')
      }
      case 'fill_blank': {
        if (stemChanged || explanationChanged || hintChanged) return true
        const origExtras = (quiz.acceptableAnswers ?? []).filter((a) => a !== quiz.answer)
        const newExtras = acceptableAnswers.filter((a) => a !== primaryAnswer)
        return primaryAnswer !== quiz.answer || origExtras.join(',') !== newExtras.join(',')
      }
    }
  }, [
    quiz,
    stem,
    explanation,
    answerHint,
    selectedOption,
    choiceOptions,
    orderedItems,
    primaryAnswer,
    acceptableAnswers,
  ])

  const handleSave = useCallback(() => {
    // Validate
    if (stem.trim().length === 0) {
      setValidationError('题干不能为空')
      return
    }
    if (quiz.interactionType === 'choice' && choiceOptions.length < 2) {
      setValidationError('选项至少需要 2 个')
      return
    }
    if (quiz.interactionType === 'fill_blank') {
      const allAnswers = [primaryAnswer, ...acceptableAnswers.filter((a) => a !== primaryAnswer)]
      if (allAnswers.every((a) => a.trim().length === 0)) {
        setValidationError('答案不能为空')
        return
      }
    }

    setValidationError(null)

    const patch: QuizEditPatch = {}
    if (stem !== quiz.stem) patch.stem = stem
    if (explanation !== quiz.explanation) patch.explanation = explanation

    switch (quiz.interactionType) {
      case 'choice': {
        if (selectedOption !== quiz.answer) patch.answer = selectedOption
        const origOptions = quiz.options ?? []
        if (
          choiceOptions.length !== origOptions.length ||
          choiceOptions.some((opt, i) => opt !== origOptions[i])
        ) {
          patch.options = choiceOptions
        }
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
        if (answerHint !== (quiz.answerHint ?? '')) {
          patch.answerHint = answerHint || undefined
        }
        break
    }

    onSave(patch)
  }, [
    quiz,
    stem,
    explanation,
    selectedOption,
    choiceOptions,
    orderedItems,
    primaryAnswer,
    acceptableAnswers,
    answerHint,
    onSave,
  ])

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-secondary">编辑此题</p>

      {validationError && <p className="text-xs text-[var(--danger)]">{validationError}</p>}

      <StemField value={stem} onChange={setStem} />

      {quiz.interactionType === 'choice' && (
        <ChoiceEditor
          options={choiceOptions}
          selectedAnswer={selectedOption}
          onSelectAnswer={setSelectedOption}
          onUpdateOptionText={updateChoiceOptionText}
          onRemoveOption={removeChoiceOption}
          onAddOption={addChoiceOption}
          optionCount={choiceOptions.length}
        />
      )}

      {quiz.interactionType === 'sorting' && (
        <SortingEditor items={orderedItems} onMoveItem={moveSortingItem} />
      )}

      {quiz.interactionType === 'fill_blank' && (
        <FillBlankEditor
          primaryAnswer={primaryAnswer}
          setPrimaryAnswer={setPrimaryAnswer}
          extraInput={extraInput}
          setExtraInput={setExtraInput}
          handleExtraBlur={handleExtraBlur}
          answerHint={answerHint}
          setAnswerHint={setAnswerHint}
        />
      )}

      <ExplanationField value={explanation} onChange={setExplanation} />

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
