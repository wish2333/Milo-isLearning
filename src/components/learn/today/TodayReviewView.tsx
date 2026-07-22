'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'
import { createProvider } from '@/lib/providers'
import { evaluateAnswerAsync } from '@/lib/runtime/evaluate-answer'
import { synchronizeScheduleForSlot } from '@/lib/runtime/fsrs-schedule-coordinator'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import { useTodaySessionStore } from '@/lib/state/today-session-store'
import { useModuleStore } from '@/lib/state/module-store'
import { getStorageValueWithLegacyFallback } from '@/lib/persistence/client/storage'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import type { Module, Quiz } from '@/types/domain'
import { QuizRenderer } from '@/components/quiz/QuizRenderer'
import { FeedbackPanel } from '@/components/quiz/FeedbackPanel'
import { BackgroundPanel } from '@/components/learn/BackgroundPanel'
import { QuizActionBar } from '@/components/quiz/QuizActionBar'

type Phase = 'answering' | 'evaluating' | 'feedback'

/** 今日复习执行页。题目和分母均来自持久化的 TodaySession 快照。 */
export function TodayReviewView() {
  const router = useRouter()
  const hydrated = useHydrated()
  const session = useTodaySessionStore((state) => state.session)
  const hydrate = useTodaySessionStore((state) => state.hydrate)
  const recordResult = useTodaySessionStore((state) => state.recordResult)
  const updateResult = useTodaySessionStore((state) => state.updateResult)
  const nextQuestion = useTodaySessionStore((state) => state.nextQuestion)
  const config = useSettingsStore((state) => state.config)
  const addAttempt = useAttemptsStore((state) => state.addAttempt)
  const getAttempts = useAttemptsStore((state) => state.getAttempts)
  const getNextAttemptVersion = useAttemptsStore((state) => state.getNextAttemptVersion)
  const markGuessed = useAttemptsStore((state) => state.markGuessed)
  const unmarkGuessed = useAttemptsStore((state) => state.unmarkGuessed)
  const reevaluateLastAttempt = useAttemptsStore((state) => state.reevaluateLastAttempt)
  const correctQuizAnswer = useModuleStore((state) => state.correctQuizAnswer)
  const setModule = useModuleStore((state) => state.setModule)
  const currentModuleId = useModuleStore((state) => state.currentModule?.id)
  const [phase, setPhase] = useState<Phase>('answering')
  const [feedback, setFeedback] = useState<FeedbackRuntime | null>(null)
  const [isGuessed, setIsGuessed] = useState(false)
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null)
  const [displayQuiz, setDisplayQuiz] = useState<Quiz | null>(null)
  const quizDisplayStart = useRef(Date.now())

  useEffect(() => {
    if (hydrated) hydrate()
  }, [hydrated, hydrate])

  const currentQueueItem = session ? session.queue[session.currentIndex] : undefined
  const currentQuiz = displayQuiz ?? currentQueueItem?.quiz
  const isFinished = session !== null && session.currentIndex >= session.queue.length
  const moduleData = currentQueueItem
    ? getStorageValueWithLegacyFallback<Module>(StorageKeys.module(currentQueueItem.moduleId))
    : null

  useEffect(() => {
    if (moduleData && currentModuleId !== moduleData.id) setModule(moduleData)
  }, [currentModuleId, moduleData, setModule])

  useEffect(() => {
    if (!currentQueueItem) return
    quizDisplayStart.current = Date.now()
    const latest = getAttempts(currentQueueItem.slotId).at(-1)
    setDisplayQuiz(currentQueueItem.quiz)
    setIsGuessed(latest?.guessed === true)
    setPhase('answering')
    setFeedback(null)
    setSubmittedAnswer(null)
  }, [currentQueueItem, getAttempts])

  const handleAnswer = useCallback(
    async (userAnswer: string) => {
      if (!currentQueueItem || !currentQuiz || !session || phase !== 'answering') return
      setPhase('evaluating')
      setSubmittedAnswer(userAnswer)

      try {
        const provider =
          config && currentQuiz.interactionType === 'fill_blank' ? createProvider(config) : null
        const result = await evaluateAnswerAsync(currentQuiz, userAnswer, provider)
        const slotId = currentQueueItem.slotId
        const timestamp = Date.now()
        addAttempt({
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `today-${timestamp}`,
          quizId: currentQuiz.id,
          originalQuizId: slotId,
          attemptVersion: getNextAttemptVersion(slotId),
          userAnswer,
          score: result.score,
          gaps: result.gaps,
          nextAction: result.nextAction,
          timestamp,
          answeredAt: timestamp,
          timeSpentMs: timestamp - quizDisplayStart.current,
          moduleId: currentQueueItem.moduleId,
          conceptId: currentQuiz.conceptId,
        })
        synchronizeScheduleForSlot({
          slotId,
          moduleId: currentQueueItem.moduleId,
          conceptId: currentQuiz.conceptId,
          quiz: currentQuiz,
          attempts: getAttempts(slotId),
        })
        recordResult(slotId, result.score)
        setFeedback(result)
        setPhase('feedback')
      } catch {
        setPhase('answering')
      }
    },
    [
      addAttempt,
      config,
      currentQueueItem,
      currentQuiz,
      getAttempts,
      getNextAttemptVersion,
      phase,
      recordResult,
      session,
    ],
  )

  const syncGuessed = useCallback(
    (guessed: boolean) => {
      if (!currentQueueItem || !currentQuiz) return
      if (guessed) markGuessed(currentQueueItem.slotId)
      else unmarkGuessed(currentQueueItem.slotId)
      synchronizeScheduleForSlot({
        slotId: currentQueueItem.slotId,
        moduleId: currentQueueItem.moduleId,
        conceptId: currentQuiz.conceptId,
        quiz: currentQuiz,
        attempts: getAttempts(currentQueueItem.slotId),
      })
      setIsGuessed(guessed)
    },
    [currentQueueItem, currentQuiz, getAttempts, markGuessed, unmarkGuessed],
  )

  const canCorrect = moduleData?.origin !== 'showcase'

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
      if (!currentQueueItem || !currentQuiz) return
      correctQuizAnswer(currentQuiz.id, patch)
      const correctedQuiz: Quiz = { ...currentQuiz, ...patch }
      setDisplayQuiz(correctedQuiz)
      const provider =
        config && correctedQuiz.interactionType === 'fill_blank' ? createProvider(config) : null
      try {
        const result = await reevaluateLastAttempt(currentQueueItem.slotId, correctedQuiz, provider)
        updateResult(currentQueueItem.slotId, result.score)
        synchronizeScheduleForSlot({
          slotId: currentQueueItem.slotId,
          moduleId: currentQueueItem.moduleId,
          conceptId: correctedQuiz.conceptId,
          quiz: correctedQuiz,
          attempts: useAttemptsStore.getState().getAttempts(currentQueueItem.slotId),
        })
        setFeedback(result)
      } catch {
        // 保留已保存的题目修改和原反馈，避免编辑失败时丢失上下文。
      }
    },
    [config, correctQuizAnswer, currentQueueItem, currentQuiz, reevaluateLastAttempt, updateResult],
  )

  const handleNext = useCallback(() => {
    setFeedback(null)
    setPhase('answering')
    nextQuestion()
  }, [nextQuestion])

  if (!hydrated) return null

  if (!session) {
    return (
      <main className="alc-page">
        <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 text-center space-y-4">
          <p className="text-sm text-fg-secondary">没有正在进行的今日复习。</p>
          <button
            type="button"
            className="alc-button-secondary text-sm px-4 py-2"
            onClick={() => router.push('/learn/today')}
          >
            返回今日复习
          </button>
        </div>
      </main>
    )
  }

  if (isFinished) {
    const passed = session.results.filter((result) => result.passed).length
    const total = session.initialDueSnapshot.length
    const rate = total > 0 ? Math.round((passed / total) * 100) : 0
    return (
      <main className="alc-page">
        <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 text-center space-y-5">
          <p className="text-lg font-medium text-fg-primary">今日复习完成</p>
          <p className="text-4xl font-semibold text-accent-primary">{rate}%</p>
          <p className="text-sm text-fg-secondary">
            正确 {passed} / 共 {total} 题
          </p>
          <button
            type="button"
            className="alc-button-primary text-sm px-4 py-2"
            onClick={() => router.push('/learn/today')}
          >
            查看今日进度
          </button>
        </div>
      </main>
    )
  }

  if (!currentQueueItem || !currentQuiz) return null
  const progress = `${session.currentIndex + 1} / ${session.initialDueSnapshot.length}`

  return (
    <main className="alc-page">
      <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 pb-32 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="alc-label">今日复习</p>
            <h1 className="text-lg font-medium text-fg-primary">按计划巩固记忆</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-tertiary">{progress}</span>
            <button
              type="button"
              className="alc-button-secondary text-xs px-3 py-1.5"
              onClick={() => router.push('/learn/today')}
            >
              退出
            </button>
          </div>
        </header>

        <BackgroundPanel background={currentQuiz.background} />
        <QuizRenderer
          quiz={currentQuiz}
          disabled={phase !== 'answering'}
          onAnswer={handleAnswer}
          submittedAnswer={phase !== 'answering' ? (submittedAnswer ?? undefined) : undefined}
        />

        {phase === 'evaluating' && (
          <p className="text-sm text-fg-tertiary animate-pulse">正在评估...</p>
        )}

        {phase === 'feedback' && feedback && (
          <>
            <FeedbackPanel
              feedback={feedback}
              explanation={currentQuiz.explanation}
              misconception={currentQuiz.misconception}
              extendedKnowledge={currentQuiz.extendedKnowledge}
              canCorrect={canCorrect}
              quiz={currentQuiz}
              onCorrectAnswer={handleCorrectAnswer}
              isGuessed={isGuessed}
              onMarkGuessed={() => syncGuessed(true)}
              onUnmarkGuessed={() => syncGuessed(false)}
            />
            <QuizActionBar>
              <button
                type="button"
                className="w-full py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm"
                onClick={handleNext}
              >
                {session.currentIndex + 1 >= session.queue.length ? '查看结果' : '下一题'}
              </button>
            </QuizActionBar>
          </>
        )}
      </div>
    </main>
  )
}
