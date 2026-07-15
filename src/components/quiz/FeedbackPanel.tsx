'use client'

/**
 * FeedbackPanel — 答题反馈面板
 *
 * 对应 docs/M4-M5-Plan.md W4 / DESIGN-SPEC §4.6。
 *
 * 视觉规范：
 *   - 答对：1px 绿色细线从底部展开 + feedbackText
 *   - 答错：温和琥珀色边框 + explanation 展开
 *   - 不用红色叉号、不用"错误"字样（feedbackSchema 负面词过滤）
 */

import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'

interface FeedbackPanelProps {
  feedback: FeedbackRuntime
  explanation?: string
  misconception?: string
  extendedKnowledge?: string
  /** 是否被强制推进（retry-policy 触发） */
  forceAdvance?: boolean
  isGuessed?: boolean
  onMarkGuessed?: () => void
  /** 撤销蒙对标注 */
  onUnmarkGuessed?: () => void
}

export function FeedbackPanel({
  feedback,
  explanation,
  misconception,
  extendedKnowledge,
  forceAdvance,
  isGuessed,
  onMarkGuessed,
  onUnmarkGuessed,
}: FeedbackPanelProps) {
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
    </div>
  )
}
