'use client'

/**
 * ConceptView — Concept 学习视图
 *
 * 对应 docs/M4-M5-Plan.md W4 / Tech Spec §5.2 gradeAttempt.
 *
 * 完整作答流程：
 *   1. 从 module 读取当前 Concept 的当前 Quiz
 *   2. 用户作答 → 本地确定性评估
 *   3. 追加 AttemptRecord → retry-policy 判断
 *   4. advance → progress-store.advance() + 清 currentQuiz
 */

import { useEffect, useState, useCallback } from 'react'

import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'
import { createProvider } from '@/lib/providers'
import { evaluateAnswerAsync } from '@/lib/runtime/evaluate-answer'
import { track } from '@/lib/runtime/analytics'
import { findQuizInModule } from '@/lib/runtime/adaptive-sequencer'
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
import { BackgroundPanel } from '@/components/learn/BackgroundPanel'
import { AdaptivePlanPanel } from '@/components/learn/AdaptivePlanPanel'
import { AnswerHistoryList } from '@/components/learn/AnswerHistoryList'
import { StaircaseProgress } from '@/components/learn/StaircaseProgress'
import { ReviewSlotBadge } from '@/components/learn/ReviewSlotBadge'
import { ReviewQueueIndicator } from '@/components/learn/ReviewQueueIndicator'

interface ConceptViewProps {
  conceptIndex: number
  quizIndex: number
}

type Phase = 'answering' | 'evaluating' | 'feedback'

export function ConceptView({ conceptIndex, quizIndex }: ConceptViewProps) {
  const currentModule = useModuleStore((s) => s.currentModule)
  const currentQuiz = useModuleStore((s) => s.currentQuiz)
  const setCurrentQuiz = useModuleStore((s) => s.setCurrentQuiz)
  const clearCurrentQuiz = useModuleStore((s) => s.clearCurrentQuiz)
  const config = useSettingsStore((s) => s.config)

  const advance = useProgressStore((s) => s.advance)
  const stage = useProgressStore((s) => s.stage)

  const addAttempt = useAttemptsStore((s) => s.addAttempt)
  const getAttempts = useAttemptsStore((s) => s.getAttempts)
  const getNextAttemptVersion = useAttemptsStore((s) => s.getNextAttemptVersion)
  const markGuessed = useAttemptsStore((s) => s.markGuessed)
  const unmarkGuessed = useAttemptsStore((s) => s.unmarkGuessed)
  const reevaluateLastAttempt = useAttemptsStore((s) => s.reevaluateLastAttempt)

  const correctQuizAnswer = useModuleStore((s) => s.correctQuizAnswer)
  const canCorrect = currentModule?.origin !== 'showcase'

  const [phase, setPhase] = useState<Phase>('answering')
  const [feedback, setFeedback] = useState<FeedbackRuntime | null>(null)
  const [forceAdvance, setForceAdvance] = useState(false)
  const [isGuessed, setIsGuessed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  // 获取当前应该显示的 quiz
  const concept = currentModule?.concepts[conceptIndex]
  const quizCount = concept?.quizSeries.quizzes.length ?? 0
  const reviewSlots = stage?.kind === 'concept' ? (stage.reviewSlots ?? []) : []
  const isReviewQuiz = quizIndex >= quizCount && reviewSlots.length > 0
  const reviewSlotIndex = isReviewQuiz ? quizIndex - quizCount : -1
  const reviewSlotId = isReviewQuiz ? reviewSlots[reviewSlotIndex] : undefined
  const reviewQuiz =
    reviewSlotId && currentModule ? findQuizInModule(currentModule, reviewSlotId) : undefined

  const slotQuiz = isReviewQuiz ? null : concept?.quizSeries.quizzes[quizIndex]
  const quiz: Quiz | null = currentQuiz ?? slotQuiz ?? reviewQuiz ?? null

  // 进入新题时重置状态并同步 currentQuiz
  useEffect(() => {
    setPhase('answering')
    setFeedback(null)
    setForceAdvance(false)
    setIsGuessed(false)
    setError(null)
    setHistoryOpen(false)
    // 如果 currentQuiz 与当前 slot 不匹配，重置为 slot quiz
    if (isReviewQuiz && reviewQuiz) {
      if (!currentQuiz || currentQuiz.id !== reviewQuiz.id) {
        setCurrentQuiz(reviewQuiz)
      }
    } else if (slotQuiz && (!currentQuiz || currentQuiz.id !== slotQuiz.id)) {
      // currentQuiz 可能是跨 view 切换遗留的（如从 Challenge 切回 Concept）
      // 只有 currentQuiz 不属于当前 slot 时才重置
      if (currentQuiz && currentQuiz.conceptId !== slotQuiz.conceptId) {
        setCurrentQuiz(slotQuiz)
      } else if (!currentQuiz) {
        setCurrentQuiz(slotQuiz)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptIndex, quizIndex])

  // auto-skip ignored concept quizzes (do not display, do not count)
  useEffect(() => {
    if (isReviewQuiz) return
    if (!slotQuiz) return
    if (!slotQuiz.ignored) return
    if (phase !== 'answering') return
    advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptIndex, quizIndex, slotQuiz, phase])

  const slotId = isReviewQuiz ? (reviewSlotId ?? '') : (slotQuiz?.id ?? '')

  const handleAnswer = useCallback(
    async (userAnswer: string) => {
      if (!quiz || !currentModule) return
      if (phase !== 'answering') return // 防止双击重复提交

      setPhase('evaluating')
      setError(null)

      // 一次性快照 attemptVersion，避免记录作答时出现竞态
      const attemptVersion = getNextAttemptVersion(slotId)

      try {
        const provider =
          config && quiz.interactionType === 'fill_blank' ? createProvider(config) : null
        const result = await evaluateAnswerAsync(quiz, userAnswer, provider)

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

        track('quiz_attempt', {
          interactionType: quiz.interactionType,
          score: result.score,
          conceptId: quiz.conceptId,
          guessed: false,
        })

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
    [quiz, currentModule, slotId, phase, config, getNextAttemptVersion, getAttempts, addAttempt],
  )

  const handleAdvance = useCallback(() => {
    clearCurrentQuiz() // clear replacement quiz, next loads from slot
    advance()
  }, [clearCurrentQuiz, advance])

  const handleCorrectAnswer = useCallback(
    async (patch: Partial<Pick<Quiz, 'answer' | 'options' | 'acceptableAnswers'>>) => {
      if (!quiz) return
      correctQuizAnswer(quiz.id, patch)
      const correctedQuiz: Quiz = { ...quiz, ...patch }
      const provider =
        config && correctedQuiz.interactionType === 'fill_blank' ? createProvider(config) : null
      try {
        const result = await reevaluateLastAttempt(slotId, correctedQuiz, provider)
        setFeedback(result)
        setIsGuessed(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : '重评失败')
      }
    },
    [quiz, slotId, config, correctQuizAnswer, reevaluateLastAttempt],
  )

  const handleIgnoreQuiz = useCallback(() => {
    if (!quiz) return
    correctQuizAnswer(quiz.id, { ignored: true })
    clearCurrentQuiz()
    advance()
  }, [quiz, correctQuizAnswer, clearCurrentQuiz, advance])

  const handleUnignoreQuiz = useCallback(() => {
    if (!quiz) return
    correctQuizAnswer(quiz.id, { ignored: false })
  }, [quiz, correctQuizAnswer])

  // --- 渲染 ---

  if (!quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center text-fg-tertiary">
        <p>题目加载中...</p>
      </div>
    )
  }

  const isAdvancing = feedback?.nextAction === 'advance' || forceAdvance

  return (
    <div className="text-fg-primary">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 text-xs text-fg-quaternary">
          <span>
            概念 {conceptIndex + 1}/{currentModule?.concepts.length ?? 0}
          </span>
          <span>·</span>
          <span>
            {isReviewQuiz
              ? `复习题 ${reviewSlotIndex + 1}/${reviewSlots.length}`
              : `题目 ${quizIndex + 1}`}
          </span>
        </div>
        <StaircaseProgress
          total={quizCount + reviewSlots.length}
          current={quizIndex}
          stage="concept"
        />
        {!isReviewQuiz && <ReviewQueueIndicator count={reviewSlots.length} />}

        {/* Concept name */}
        {concept && (
          <p className="text-xs text-fg-tertiary uppercase tracking-wider">{concept.name}</p>
        )}

        {/* Answer history toggle */}
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="alc-button-secondary text-xs px-3 py-1.5"
        >
          {historyOpen ? '收起答题历史' : '答题历史'}
        </button>

        {historyOpen && currentModule && (
          <AnswerHistoryList module={currentModule} currentSlotId={slotId} />
        )}

        {/* Quiz */}
        <div className="pt-2 space-y-4">
          {isReviewQuiz && <ReviewSlotBadge />}
          <BackgroundPanel background={quiz.background} />
          <QuizRenderer quiz={quiz} disabled={phase !== 'answering'} onAnswer={handleAnswer} />
        </div>

        {/* Evaluating */}
        {phase === 'evaluating' && (
          <p className="text-sm text-fg-tertiary animate-pulse">正在评估...</p>
        )}

        {/* Feedback */}
        {phase === 'feedback' && feedback && (
          <>
            <FeedbackPanel
              feedback={feedback}
              explanation={quiz.explanation}
              misconception={quiz.misconception}
              extendedKnowledge={quiz.extendedKnowledge}
              forceAdvance={forceAdvance}
              isGuessed={isGuessed}
              onMarkGuessed={() => {
                markGuessed(slotId)
                setIsGuessed(true)
              }}
              onUnmarkGuessed={() => {
                unmarkGuessed(slotId)
                setIsGuessed(false)
              }}
              canCorrect={canCorrect}
              quiz={quiz}
              onCorrectAnswer={handleCorrectAnswer}
              onIgnoreQuiz={handleIgnoreQuiz}
              onUnignoreQuiz={handleUnignoreQuiz}
            />

            {!isAdvancing && (
              <AdaptivePlanPanel rationale="这题已记录为薄弱点。主线会继续按题号推进，避免题目顺序和进度提示错位。" />
            )}

            {/* Action buttons */}
            <div className="pt-2 space-y-2">
              <button
                onClick={handleAdvance}
                className="w-full py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm hover:bg-accent-primary-hover transition-colors"
              >
                {isAdvancing ? '继续' : '继续下一步'}
              </button>
            </div>
          </>
        )}

        {/* Error */}
        {error && <p className="text-sm text-danger/80">{error}</p>}

        {/* Retry hint */}
        {phase === 'feedback' && !isAdvancing && !forceAdvance && (
          <p className="text-xs text-fg-quaternary text-center">
            {getConsecutiveFailures(getAttempts(slotId))} / {MAX_CONSECUTIVE_FAILURES} 次尝试
          </p>
        )}
      </div>
    </div>
  )
}
