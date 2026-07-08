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
  /** 是否被强制推进（retry-policy 触发） */
  forceAdvance?: boolean
}

export function FeedbackPanel({ feedback, explanation, forceAdvance }: FeedbackPanelProps) {
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
            <li key={gap} className="text-xs text-neutral-500 flex items-start gap-2">
              <span className="text-neutral-600 mt-0.5">-</span>
              <span>{gap}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Explanation */}
      {explanation && !passed && (
        <div className="pt-2 border-t border-neutral-800/50">
          <p className="text-xs text-neutral-500 leading-relaxed">{explanation}</p>
        </div>
      )}

      {/* Force advance notice */}
      {forceAdvance && <p className="text-xs text-amber-400/60 pt-1">已尝试多次，自动进入下一题</p>}
    </div>
  )
}
