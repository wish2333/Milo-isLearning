'use client'

/**
 * AnswerHistoryList — 答题历史列表组件
 *
 * 功能：
 *   - 遍历 Module 内所有 Concept quiz + Challenge quiz
 *   - 对每道题查询 attempts-store，展示已作答的题目
 *   - 显示题干、用户作答、参考答案、解析
 *   - 支持折叠/展开单条记录
 *
 * 使用场景：
 *   - ConceptView / ChallengeView 中的"答题历史"面板（学习中回看）
 *   - /learn/history/[id] 页面（题库列表入口）
 */

import { useMemo, useState } from 'react'

import { useAttemptsStore } from '@/lib/state/attempts-store'
import type { AttemptRecord, Module, Quiz } from '@/types/domain'

interface AnswerHistoryListProps {
  module: Module
  /** 当前正在作答的 slot id（用于高亮标记），可选 */
  currentSlotId?: string
}

interface AnsweredQuiz {
  quiz: Quiz
  /** 该题所属的分组名（Concept 名 或 'Module Challenge'） */
  groupName: string
  /** 最新一次作答记录 */
  latestAttempt: AttemptRecord | undefined
  /** 全部作答记录 */
  attempts: AttemptRecord[]
}

/**
 * 收集 Module 内所有已作答的 quiz（含 Challenge）。
 *
 * 只返回有 AttemptRecord 的题目，按 Concept 顺序 + Challenge 顺序排列。
 */
function collectAnsweredQuizzes(
  module: Module,
  attemptsBySlot: Record<string, AttemptRecord[]>,
): AnsweredQuiz[] {
  const result: AnsweredQuiz[] = []

  // Concept quizzes
  for (const concept of module.concepts) {
    for (const quiz of concept.quizSeries.quizzes) {
      const attempts = attemptsBySlot[quiz.id]
      if (attempts && attempts.length > 0) {
        result.push({
          quiz,
          groupName: concept.name,
          latestAttempt: attempts.at(-1),
          attempts,
        })
      }
    }
  }

  // Challenge quizzes
  if (module.challengeQuizzes) {
    for (const quiz of module.challengeQuizzes) {
      const attempts = attemptsBySlot[quiz.id]
      if (attempts && attempts.length > 0) {
        result.push({
          quiz,
          groupName: 'Module Challenge',
          latestAttempt: attempts.at(-1),
          attempts,
        })
      }
    }
  }

  return result
}

export function AnswerHistoryList({ module, currentSlotId }: AnswerHistoryListProps) {
  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const answeredQuizzes = useMemo(
    () => collectAnsweredQuizzes(module, attemptsBySlot),
    [module, attemptsBySlot],
  )

  if (answeredQuizzes.length === 0) {
    return (
      <div className="alc-card p-6 text-center space-y-1">
        <p className="text-sm text-fg-secondary">暂无作答记录</p>
        <p className="alc-muted text-xs">开始答题后，这里会显示每道题的作答情况和答案解析</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {answeredQuizzes.map(({ quiz, groupName, latestAttempt, attempts }) => {
        const isExpanded = expandedId === quiz.id
        const isCorrect = latestAttempt?.nextAction === 'advance'
        const isCurrent = currentSlotId === quiz.id
        const attemptCount = attempts.length

        return (
          <div
            key={quiz.id}
            className={`alc-card overflow-hidden transition-all ${
              isCurrent ? 'ring-1 ring-accent-primary/40' : ''
            }`}
          >
            {/* Collapsed header — click to expand */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : quiz.id)}
              className="w-full text-left p-3 flex items-start gap-3 hover:bg-bg-elevated/50 transition-colors"
            >
              {/* Status indicator */}
              <span
                className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${
                  isCorrect ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
                }`}
              >
                {isCorrect ? '对' : '错'}
              </span>
              {isCorrect && latestAttempt?.guessed && (
                <span className="shrink-0 text-xs text-fg-quaternary">（蒙）</span>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="alc-label shrink-0">{groupName}</span>
                  {attemptCount > 1 && (
                    <span className="text-xs text-fg-tertiary shrink-0">
                      尝试 {attemptCount} 次
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-xs text-accent-primary shrink-0">当前题</span>
                  )}
                </div>
                <p className="text-sm text-fg-primary mt-1 line-clamp-2">{quiz.stem}</p>
              </div>

              <span
                className={`shrink-0 text-xs text-fg-tertiary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              >
                {'\u203A'}
              </span>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-border-subtle/50">
                {/* User answer */}
                {latestAttempt && (
                  <div className="pt-3">
                    <p className="alc-label">你的作答</p>
                    <p
                      className={`mt-1 text-sm whitespace-pre-wrap ${
                        isCorrect ? 'text-success/80' : 'text-warning/80'
                      }`}
                    >
                      {latestAttempt.userAnswer || '(空)'}
                    </p>
                  </div>
                )}

                {/* Correct answer */}
                <div className="rounded-md border border-success/30 bg-success-soft/50 p-3">
                  <p className="alc-label text-success">参考答案</p>
                  <p className="mt-1 text-sm text-fg-primary whitespace-pre-wrap">
                    {quiz.interactionType === 'sorting'
                      ? (quiz.options ?? []).join(' → ')
                      : quiz.answer}
                  </p>
                </div>

                {/* Explanation */}
                {quiz.explanation && (
                  <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
                    <p className="alc-label">解析</p>
                    <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
                      {quiz.explanation}
                    </p>
                  </div>
                )}

                {/* Misconception (only when wrong) */}
                {!isCorrect && quiz.misconception && (
                  <div className="rounded-md border border-warning/30 bg-warning-soft/30 p-3">
                    <p className="alc-label text-warning">容易卡住的地方</p>
                    <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
                      {quiz.misconception}
                    </p>
                  </div>
                )}

                {/* Extended knowledge */}
                {quiz.extendedKnowledge && (
                  <details className="text-xs text-fg-tertiary">
                    <summary className="cursor-pointer text-fg-secondary">延伸理解</summary>
                    <p className="pt-2 leading-relaxed">{quiz.extendedKnowledge}</p>
                  </details>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
