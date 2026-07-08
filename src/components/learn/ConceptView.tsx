'use client'

/**
 * ConceptView — Concept 学习视图
 *
 * 对应 docs/M4-M5-Plan.md W4 / Tech Spec §5.2 gradeAttempt。
 *
 * 完整作答流程：
 *   1. 从 module 读取当前 Concept 的当前 Quiz
 *   2. 用户作答 → 本地确定性评估
 *   3. 追加 AttemptRecord → retry-policy 判断
 *   4. advance → progress-store.advance() + 清 currentQuiz
 *   5. retry → POST /api/regenerate → module-store.replaceCurrentQuiz
 */

import { useEffect, useState, useCallback } from 'react'

import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'
import { evaluateAnswer } from '@/lib/runtime/evaluate-answer'
import {
  shouldForceAdvance,
  getConsecutiveFailures,
  MAX_CONSECUTIVE_FAILURES,
} from '@/lib/runtime/retry-policy'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import type { AttemptRecord, Quiz } from '@/types/domain'

import { FeedbackPanel } from '@/components/quiz/FeedbackPanel'
import { QuizRenderer } from '@/components/quiz/QuizRenderer'

interface ConceptViewProps {
  conceptIndex: number
  quizIndex: number
}

type Phase = 'answering' | 'evaluating' | 'feedback' | 'regenerating'

export function ConceptView({ conceptIndex, quizIndex }: ConceptViewProps) {
  const currentModule = useModuleStore((s) => s.currentModule)
  const currentQuiz = useModuleStore((s) => s.currentQuiz)
  const setCurrentQuiz = useModuleStore((s) => s.setCurrentQuiz)
  const replaceCurrentQuiz = useModuleStore((s) => s.replaceCurrentQuiz)
  const clearCurrentQuiz = useModuleStore((s) => s.clearCurrentQuiz)
  const config = useSettingsStore((s) => s.config)

  const advance = useProgressStore((s) => s.advance)
  const retry = useProgressStore((s) => s.retry)

  const addAttempt = useAttemptsStore((s) => s.addAttempt)
  const getAttempts = useAttemptsStore((s) => s.getAttempts)
  const getNextAttemptVersion = useAttemptsStore((s) => s.getNextAttemptVersion)

  const [phase, setPhase] = useState<Phase>('answering')
  const [feedback, setFeedback] = useState<FeedbackRuntime | null>(null)
  const [forceAdvance, setForceAdvance] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 获取当前应该显示的 quiz
  const concept = currentModule?.concepts[conceptIndex]
  const slotQuiz = concept?.quizSeries.quizzes[quizIndex]
  const quiz: Quiz | null = currentQuiz ?? slotQuiz ?? null

  // 进入新题时重置状态并同步 currentQuiz
  useEffect(() => {
    setPhase('answering')
    setFeedback(null)
    setForceAdvance(false)
    setError(null)
    // 如果 currentQuiz 与当前 slot 不匹配，重置为 slot quiz
    if (slotQuiz && (!currentQuiz || currentQuiz.id !== slotQuiz.id)) {
      // currentQuiz 可能是 retry 替换题（id 不同但 originalQuizId = slotQuiz.id）
      // 只有 currentQuiz 不属于当前 slot 时才重置
      if (currentQuiz && currentQuiz.conceptId !== slotQuiz.conceptId) {
        setCurrentQuiz(slotQuiz)
      } else if (!currentQuiz) {
        setCurrentQuiz(slotQuiz)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptIndex, quizIndex])

  const slotId = slotQuiz?.id ?? ''

  const handleAnswer = useCallback(
    async (userAnswer: string) => {
      if (!quiz || !currentModule) return
      if (phase !== 'answering') return // 防止双击重复提交

      setPhase('evaluating')
      setError(null)

      // 一次性快照 attemptVersion，避免记录作答时出现竞态
      const attemptVersion = getNextAttemptVersion(slotId)

      try {
        const result = evaluateAnswer(quiz, userAnswer)

        // 记录 AttemptRecord（attemptVersion 已在函数入口快照，避免竞态）
        const attempt: AttemptRecord = {
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `att-${Date.now()}`,
          quizId: quiz.id,
          originalQuizId: slotId,
          attemptVersion,
          userAnswer,
          score: result.score,
          gaps: result.gaps,
          nextAction: result.nextAction,
          timestamp: Date.now(),
        }
        addAttempt(attempt)

        // 检查 retry-policy
        const attempts = getAttempts(slotId)
        const shouldForce = shouldForceAdvance(attempts)

        setFeedback(result)
        setForceAdvance(shouldForce)
        setPhase('feedback')
      } catch (err) {
        setError(err instanceof Error ? err.message : '评估失败，请重试')
        setPhase('answering')
      }
    },
    [quiz, currentModule, slotId, phase, getNextAttemptVersion, getAttempts, addAttempt],
  )

  const handleAdvance = useCallback(() => {
    clearCurrentQuiz() // 清除替换题，下道题从 slot 加载
    advance()
  }, [clearCurrentQuiz, advance])

  const handleRetry = useCallback(async () => {
    if (!quiz || !config || !currentModule || !concept) return

    setPhase('regenerating')
    setError(null)

    try {
      const response = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeholder: {
            id: slotId,
            conceptId: concept.id,
            ladderLevel: quiz.ladderLevel,
            expressionLevel: quiz.expressionLevel,
            interactionType: quiz.interactionType,
          },
          concept,
          moduleContext: { title: currentModule.title, intro: currentModule.intro },
          originalQuiz: quiz,
          llmConfig: config,
        }),
      })

      if (!response.ok) {
        throw new Error(`Regenerate API 失败: ${response.status}`)
      }

      const data: { quiz: Quiz } = await response.json()
      replaceCurrentQuiz(data.quiz)
      retry() // 更新 progress 时间戳（不转移 stage）

      // 重置为答题态
      setPhase('answering')
      setFeedback(null)
      setForceAdvance(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '题目生成失败，请重试')
      setPhase('feedback') // 回到反馈态让用户重试
    }
  }, [quiz, config, currentModule, concept, slotId, replaceCurrentQuiz, retry])

  // --- 渲染 ---

  if (!quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-500">
        <p>题目加载中...</p>
      </div>
    )
  }

  const isAdvancing = feedback?.nextAction === 'advance' || forceAdvance

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <span>
            概念 {conceptIndex + 1}/{currentModule?.concepts.length ?? 0}
          </span>
          <span>·</span>
          <span>题目 {quizIndex + 1}</span>
        </div>

        {/* Concept name */}
        {concept && (
          <p className="text-xs text-neutral-500 uppercase tracking-wider">{concept.name}</p>
        )}

        {/* Quiz */}
        <div className="pt-2">
          <QuizRenderer quiz={quiz} disabled={phase !== 'answering'} onAnswer={handleAnswer} />
        </div>

        {/* Evaluating */}
        {phase === 'evaluating' && (
          <p className="text-sm text-neutral-500 animate-pulse">正在评估...</p>
        )}

        {/* Regenerating */}
        {phase === 'regenerating' && (
          <p className="text-sm text-neutral-500 animate-pulse">正在生成新题...</p>
        )}

        {/* Feedback */}
        {phase === 'feedback' && feedback && (
          <>
            <FeedbackPanel
              feedback={feedback}
              explanation={quiz.explanation}
              forceAdvance={forceAdvance}
            />

            {/* Action buttons */}
            <div className="pt-2">
              {isAdvancing ? (
                <button
                  onClick={handleAdvance}
                  className="w-full py-3 rounded-lg bg-neutral-100 text-neutral-900 font-medium text-sm hover:bg-white transition-colors"
                >
                  继续
                </button>
              ) : (
                <button
                  onClick={handleRetry}
                  className="w-full py-3 rounded-lg border border-neutral-700 text-neutral-300 font-medium text-sm hover:bg-neutral-900 transition-colors"
                >
                  换一道题
                </button>
              )}
            </div>
          </>
        )}

        {/* Error */}
        {error && <p className="text-sm text-red-400/80">{error}</p>}

        {/* Retry hint */}
        {phase === 'feedback' && !isAdvancing && !forceAdvance && (
          <p className="text-xs text-neutral-600 text-center">
            {getConsecutiveFailures(getAttempts(slotId))} / {MAX_CONSECUTIVE_FAILURES} 次尝试
          </p>
        )}
      </div>
    </div>
  )
}
