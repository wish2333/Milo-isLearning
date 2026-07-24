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

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'

import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'
import { createProvider } from '@/lib/providers'
import { evaluateAnswerAsync } from '@/lib/runtime/evaluate-answer'
import { synchronizeScheduleForSlot } from '@/lib/runtime/fsrs-schedule-coordinator'
import { track } from '@/lib/runtime/analytics'
import { findQuizInModule, findQuizInTopic } from '@/lib/runtime/adaptive-sequencer'
import {
  shouldForceAdvance,
  getConsecutiveFailures,
  MAX_CONSECUTIVE_FAILURES,
} from '@/lib/runtime/retry-policy'
import { loadStoredModule } from '@/lib/persistence/module-library'
import { getStorage } from '@/lib/persistence/client/storage'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import { useTopicSessionStore } from '@/lib/state/topic-session-store'
import type { AttemptRecord, Module, Quiz } from '@/types/domain'

import { FeedbackPanel } from '@/components/quiz/FeedbackPanel'
import { QuizRenderer } from '@/components/quiz/QuizRenderer'
import { BackgroundPanel } from '@/components/learn/BackgroundPanel'
import { AdaptivePlanPanel } from '@/components/learn/AdaptivePlanPanel'
import { AnswerHistoryList } from '@/components/learn/AnswerHistoryList'
import { StaircaseProgress } from '@/components/learn/StaircaseProgress'
import { ReviewSlotBadge } from '@/components/learn/ReviewSlotBadge'
import { ReviewQueueIndicator } from '@/components/learn/ReviewQueueIndicator'
import { QuizActionBar } from '@/components/quiz/QuizActionBar'

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
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null)
  const activeModuleIdRef = useRef<string | null>(null)
  const activeSlotIdRef = useRef<string | null>(null)

  // 获取当前应该显示的 quiz
  const session = useTopicSessionStore((s) => s.session)
  const topicModules: Module[] = useMemo(() => {
    if (!currentModule) return []
    if (!session) return [currentModule]
    const mods: Module[] = []
    for (const id of session.moduleIds) {
      const m = loadStoredModule(getStorage(), id)
      if (m) mods.push(m)
    }
    return mods.length > 0 ? mods : [currentModule]
  }, [currentModule, session])

  const concept = currentModule?.concepts[conceptIndex]
  const quizCount = concept?.quizSeries.quizzes.length ?? 0
  const reviewSlots = stage?.kind === 'concept' ? (stage.reviewSlots ?? []) : []
  const reviewSlotIndex = quizIndex - quizCount
  const isReviewQuiz = reviewSlotIndex >= 0 && reviewSlotIndex < reviewSlots.length
  const reviewSlotId = isReviewQuiz ? reviewSlots[reviewSlotIndex] : undefined
  const foundReviewQuiz = reviewSlotId ? findQuizInTopic(topicModules, reviewSlotId) : undefined
  const reviewQuiz = foundReviewQuiz?.ignored ? undefined : foundReviewQuiz

  const crossModuleSourceName = useMemo(() => {
    if (!isReviewQuiz || !reviewSlotId || !currentModule) return undefined
    if (findQuizInModule(currentModule, reviewSlotId)) return undefined
    const owner = topicModules.find(
      (m) => m.id !== currentModule.id && findQuizInModule(m, reviewSlotId) !== undefined,
    )
    return owner?.title
  }, [isReviewQuiz, reviewSlotId, currentModule, topicModules])

  const slotQuiz = quizIndex < quizCount ? concept?.quizSeries.quizzes[quizIndex] : undefined
  const expectedQuiz: Quiz | undefined = isReviewQuiz ? reviewQuiz : slotQuiz
  const slotId = isReviewQuiz ? (reviewSlotId ?? '') : (slotQuiz?.id ?? '')

  // currentQuiz may be a retry replacement. Accept it only when it belongs to
  // the current concept and is not another original quiz from this module;
  // otherwise a persisted quiz from the previous slot/module can overwrite
  // the stage cursor (the source of the "题目 9" symptom).
  const currentQuizIsRetryReplacement = Boolean(
    currentModule &&
    expectedQuiz &&
    currentQuiz &&
    activeModuleIdRef.current === currentModule.id &&
    activeSlotIdRef.current === slotId &&
    !findQuizInModule(currentModule, currentQuiz.id),
  )
  const currentQuizBelongsToSlot = Boolean(
    expectedQuiz &&
    currentQuiz &&
    currentQuiz.conceptId === expectedQuiz.conceptId &&
    (currentQuiz.id === expectedQuiz.id || currentQuizIsRetryReplacement),
  )
  const quiz: Quiz | null = expectedQuiz
    ? currentQuizBelongsToSlot
      ? currentQuiz
      : expectedQuiz
    : null

  // 进入新题时重置状态并同步 currentQuiz
  useEffect(() => {
    setPhase('answering')
    setFeedback(null)
    setForceAdvance(false)
    setIsGuessed(false)
    setError(null)
    setHistoryOpen(false)
    setSubmittedAnswer(null)
    activeModuleIdRef.current = currentModule?.id ?? null
    activeSlotIdRef.current = slotId || null
    // 如果 currentQuiz 与当前 slot 不匹配，重置为 slot quiz；retry
    // replacement 不在 module 中，因此由 currentQuizBelongsToSlot 保留。
    if (expectedQuiz && !currentQuizBelongsToSlot) setCurrentQuiz(expectedQuiz)
    if (!expectedQuiz && currentQuiz) clearCurrentQuiz()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModule?.id, conceptIndex, quizIndex, slotId])

  // 旧快照可能把无效 review slot 留在当前 cursor。不能让页面停留在
  // `reviewQuiz === undefined` 的空题状态，交给状态机压缩/跳过该槽位。
  useEffect(() => {
    if (!currentModule || stage?.kind !== 'concept') return
    if (phase !== 'answering' || expectedQuiz) return
    clearCurrentQuiz()
    advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModule?.id, stage, phase, expectedQuiz, clearCurrentQuiz, advance])

  // auto-skip ignored concept quizzes (do not display, do not count)
  useEffect(() => {
    if (isReviewQuiz) return
    if (!slotQuiz) return
    if (!slotQuiz.ignored) return
    if (phase !== 'answering') return
    advance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptIndex, quizIndex, slotQuiz, phase])

  const handleAnswer = useCallback(
    async (userAnswer: string) => {
      if (!quiz || !currentModule) return
      if (phase !== 'answering') return // 防止双击重复提交

      setPhase('evaluating')
      setError(null)
      setSubmittedAnswer(userAnswer)

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
          moduleId: currentModule.id,
          conceptId: concept?.id ?? quiz.conceptId,
        }
        addAttempt(attempt)
        synchronizeScheduleForSlot({
          slotId,
          moduleId: currentModule.id,
          conceptId: concept?.id ?? quiz.conceptId,
          quiz,
          attempts: getAttempts(slotId),
        })

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
    [
      quiz,
      currentModule,
      concept,
      slotId,
      phase,
      config,
      getNextAttemptVersion,
      getAttempts,
      addAttempt,
    ],
  )

  const handleAdvance = useCallback(() => {
    clearCurrentQuiz() // clear replacement quiz, next loads from slot
    advance()
  }, [clearCurrentQuiz, advance])

  const handleCorrectAnswer = useCallback(
    async (
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
    ) => {
      if (!quiz) return
      correctQuizAnswer(quiz.id, patch)
      const correctedQuiz: Quiz = { ...quiz, ...patch }
      const provider =
        config && correctedQuiz.interactionType === 'fill_blank' ? createProvider(config) : null
      try {
        const result = await reevaluateLastAttempt(slotId, correctedQuiz, provider)
        if (currentModule) {
          synchronizeScheduleForSlot({
            slotId,
            moduleId: currentModule.id,
            conceptId: concept?.id ?? correctedQuiz.conceptId,
            quiz: correctedQuiz,
            attempts: getAttempts(slotId),
          })
        }
        setFeedback(result)
        setIsGuessed(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : '重评失败')
      }
    },
    [
      quiz,
      currentModule,
      concept,
      slotId,
      config,
      correctQuizAnswer,
      reevaluateLastAttempt,
      getAttempts,
    ],
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
      <div className="max-w-2xl mx-auto px-6 py-8 pb-32 space-y-6">
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
          {isReviewQuiz && <ReviewSlotBadge moduleName={crossModuleSourceName} />}
          <BackgroundPanel background={quiz.background} />
          <QuizRenderer
            quiz={quiz}
            disabled={phase !== 'answering'}
            onAnswer={handleAnswer}
            submittedAnswer={phase !== 'answering' ? (submittedAnswer ?? undefined) : undefined}
          />
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
                if (currentModule) {
                  synchronizeScheduleForSlot({
                    slotId,
                    moduleId: currentModule.id,
                    conceptId: concept?.id ?? quiz.conceptId,
                    quiz,
                    attempts: getAttempts(slotId),
                  })
                }
                setIsGuessed(true)
              }}
              onUnmarkGuessed={() => {
                unmarkGuessed(slotId)
                if (currentModule) {
                  synchronizeScheduleForSlot({
                    slotId,
                    moduleId: currentModule.id,
                    conceptId: concept?.id ?? quiz.conceptId,
                    quiz,
                    attempts: getAttempts(slotId),
                  })
                }
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
            <QuizActionBar>
              <button
                onClick={handleAdvance}
                className="w-full py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm hover:bg-accent-primary-hover transition-colors"
              >
                {isAdvancing ? '继续' : '继续下一步'}
              </button>
            </QuizActionBar>
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
