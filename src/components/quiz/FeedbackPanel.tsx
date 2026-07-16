'use client'

/**
 * FeedbackPanel -- answer feedback panel
 *
 * Visual spec:
 *   - Correct: 1px emerald border + feedbackText
 *   - Wrong: warm amber border + explanation expand
 *   - No red crosses, no "error" text (feedbackSchema negative-word filter)
 *
 * F40/F41: optional correction/ignore controls below explanation.
 */

import { useState } from 'react'

import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'
import type { Quiz } from '@/types/domain'

import { ConfirmInline } from '@/components/common/ConfirmInline'
import { AnswerCorrector } from '@/components/quiz/AnswerCorrector'

interface FeedbackPanelProps {
  feedback: FeedbackRuntime
  explanation?: string
  misconception?: string
  extendedKnowledge?: string
  /** force-advance (retry-policy triggered) */
  forceAdvance?: boolean
  isGuessed?: boolean
  onMarkGuessed?: () => void
  /** undo guessed mark */
  onUnmarkGuessed?: () => void
  /** allow correction/ignore (showcase origin = false) */
  canCorrect?: boolean
  /** current quiz (for correction UI + ignored state) */
  quiz?: Quiz
  /** correction answer callback (F40 / 题目编辑) */
  onCorrectAnswer?: (
    patch: Partial<
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
    >,
  ) => void
  /** ignore quiz callback (F41) */
  onIgnoreQuiz?: () => void
  /** undo ignore callback */
  onUnignoreQuiz?: () => void
}

type CorrectionMode = 'idle' | 'correcting'

export function FeedbackPanel({
  feedback,
  explanation,
  misconception,
  extendedKnowledge,
  forceAdvance,
  isGuessed,
  onMarkGuessed,
  onUnmarkGuessed,
  canCorrect,
  quiz,
  onCorrectAnswer,
  onIgnoreQuiz,
  onUnignoreQuiz,
}: FeedbackPanelProps) {
  const [mode, setMode] = useState<CorrectionMode>('idle')
  const passed = feedback.nextAction === 'advance'
  const showAmber = !passed && !forceAdvance

  return (
    <div
      className={`mt-6 rounded-lg border p-4 space-y-2 transition-all duration-300 ${
        passed
          ? 'border-emerald-700/30 bg-emerald-950/10'
          : showAmber
            ? 'border-amber-700/30 bg-amber-950/10'
            : 'border-amber-700/40 bg-amber-950/15'
      }`}
    >
      {/* Feedback text */}
      <p className={`text-sm ${passed ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>
        {feedback.feedbackText}
      </p>

      {/* Gaps */}
      {feedback.gaps.length > 0 && (
        <ul className="space-y-1">
          {feedback.gaps.map((gap) => (
            <li key={gap} className="text-xs text-fg-tertiary flex items-start gap-2">
              <span className="text-fg-tertiary mt-0.5">-</span>
              <span>{gap}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Explanation */}
      {explanation && (
        <div
          className="alc-explanation pt-2 border-t border-border-subtle space-y-1"
          data-state={passed ? 'correct' : 'retry'}
        >
          <p className="alc-explanation-label text-xs text-fg-secondary">解析</p>
          <p className="text-xs text-fg-tertiary leading-relaxed">{explanation}</p>
        </div>
      )}

      {misconception && !passed && (
        <div className="alc-misconception rounded-md border border-amber-800/30 bg-amber-950/10 p-3 space-y-1">
          <p className="alc-explanation-label text-xs text-amber-300/70">容易卡住的地方</p>
          <p className="text-xs text-fg-tertiary leading-relaxed">{misconception}</p>
        </div>
      )}

      {extendedKnowledge && (
        <details className="alc-extended pt-1 text-xs text-fg-tertiary">
          <summary className="cursor-pointer text-fg-secondary">延伸理解</summary>
          <p className="pt-2 leading-relaxed">{extendedKnowledge}</p>
        </details>
      )}

      {/* Force advance notice */}
      {forceAdvance && <p className="text-xs text-amber-400/60 pt-1">已尝试多次，自动进入下一题</p>}

      {/* Guessed marking */}
      {passed && !forceAdvance && onMarkGuessed && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMarkGuessed}
            disabled={isGuessed}
            aria-label={isGuessed ? '已标记为蒙对' : '标记为蒙对'}
            className={`text-xs transition-colors ${
              isGuessed
                ? 'text-fg-quaternary cursor-default'
                : 'text-fg-tertiary hover:text-fg-secondary'
            }`}
          >
            {isGuessed ? '已标记蒙对' : '其实是蒙对的'}
          </button>
          {isGuessed && onUnmarkGuessed && (
            <button
              type="button"
              onClick={onUnmarkGuessed}
              aria-label="撤销蒙对标记"
              className="text-xs text-fg-quaternary hover:text-fg-tertiary transition-colors underline"
            >
              撤销
            </button>
          )}
        </div>
      )}

      {/* Ignored notice (F41) */}
      {quiz?.ignored && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-fg-quaternary">已忽略</span>
          {onUnignoreQuiz && (
            <button
              type="button"
              onClick={onUnignoreQuiz}
              aria-label="撤销忽略"
              className="text-xs text-fg-quaternary hover:text-fg-tertiary transition-colors underline"
            >
              撤销忽略
            </button>
          )}
        </div>
      )}

      {/* Correction / Ignore controls (F40/F41) */}
      {canCorrect &&
        quiz &&
        !quiz.ignored &&
        !forceAdvance &&
        onCorrectAnswer &&
        mode === 'idle' && (
          <div className="flex items-center gap-3 flex-wrap">
            <ConfirmInline
              trigger="编辑此题"
              confirmLabel="确认编辑此题？"
              onConfirm={() => setMode('correcting')}
              triggerClassName="text-xs text-fg-tertiary hover:text-fg-secondary transition-colors"
            />
            {onIgnoreQuiz && (
              <ConfirmInline
                trigger="忽略此题"
                confirmLabel="确认忽略？将不计入掌握度"
                onConfirm={onIgnoreQuiz}
                destructive
                triggerClassName="text-xs text-fg-tertiary hover:text-fg-secondary transition-colors"
              />
            )}
          </div>
        )}

      {/* Correction form (F40) */}
      {mode === 'correcting' && quiz && onCorrectAnswer && (
        <AnswerCorrector
          quiz={quiz}
          onSave={(patch) => {
            onCorrectAnswer(patch)
            setMode('idle')
          }}
          onCancel={() => setMode('idle')}
        />
      )}
    </div>
  )
}
