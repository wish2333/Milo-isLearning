'use client'

/**
 * 错题重刷页 — 独立的错题复习会话
 *
 * 从 history 或 library 的"重刷错题"按钮进入。
 * 加载该 Module 的所有错题/蒙对题，随机顺序逐一作答。
 * 会话不持久化（刷新即丢失）。
 */

import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { evaluateAnswerAsync } from '@/lib/runtime/evaluate-answer'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useReviewStore } from '@/lib/state/review-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import { StorageKeys } from '@/lib/persistence/keys'
import { storage } from '@/lib/persistence/local-storage'
import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'

import { FeedbackPanel } from '@/components/quiz/FeedbackPanel'
import { QuizRenderer } from '@/components/quiz/QuizRenderer'
import { createProvider } from '@/lib/providers'

type Phase = 'answering' | 'evaluating' | 'feedback'

export default function ReviewPage() {
  const router = useRouter()
  const params = useParams<{ moduleId: string }>()
  const hydrated = useHydrated()

  const { session, startSession, recordResult, nextQuestion, endSession } = useReviewStore()
  const addAttempt = useAttemptsStore((s) => s.addAttempt)
  const getNextAttemptVersion = useAttemptsStore((s) => s.getNextAttemptVersion)
  const config = useSettingsStore((s) => s.config)

  const [phase, setPhase] = useState<Phase>('answering')
  const [feedback, setFeedback] = useState<FeedbackRuntime | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    if (!hydrated || !params.moduleId) return
    const moduleData = storage.get(StorageKeys.module(params.moduleId))
    if (!moduleData) {
      setNotFound(true)
      return
    }
    if (!session || session.moduleId !== params.moduleId) {
      endSession()
      startSession(params.moduleId)
      // Check if session was actually started (has wrong questions)
      // We check after a tick since startSession is sync
    }
  }, [hydrated, params.moduleId, session, startSession, endSession])

  // Detect empty session (no wrong questions)
  useEffect(() => {
    if (session && session.queue.length === 0 && session.results.length === 0) {
      setEmpty(true)
    }
  }, [session])

  const currentQuiz = session ? session.queue[session.currentIndex] : null
  const isFinished = session !== null && session.currentIndex >= session.queue.length

  const handleAnswer = useCallback(
    async (userAnswer: string) => {
      if (!currentQuiz || !session) return
      if (phase !== 'answering') return

      setPhase('evaluating')

      const attemptVersion = getNextAttemptVersion(currentQuiz.id)

      try {
        const provider =
          config && currentQuiz.interactionType === 'fill_blank' ? createProvider(config) : null
        const result = await evaluateAnswerAsync(currentQuiz, userAnswer, provider)

        addAttempt({
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `rev-${Date.now()}`,
          quizId: currentQuiz.id,
          originalQuizId: currentQuiz.id,
          attemptVersion,
          userAnswer,
          score: result.score,
          gaps: result.gaps,
          nextAction: result.nextAction,
          timestamp: Date.now(),
        })

        recordResult(currentQuiz.id, result.score)
        setFeedback(result)
        setPhase('feedback')
      } catch {
        setPhase('answering')
      }
    },
    [currentQuiz, session, phase, config, getNextAttemptVersion, addAttempt, recordResult],
  )

  const handleNext = useCallback(() => {
    if (!session) return
    if (session.currentIndex + 1 >= session.queue.length) {
      // Finished
      return
    }
    setPhase('answering')
    setFeedback(null)
    nextQuestion()
  }, [session, nextQuestion])

  const handleEnd = useCallback(() => {
    endSession()
    router.push('/learn/library')
  }, [endSession, router])

  if (!hydrated) return null

  if (notFound) {
    return (
      <main className="alc-page">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center space-y-4">
          <p className="text-sm text-fg-secondary">Module 不存在或已被删除</p>
          <button
            type="button"
            onClick={() => router.push('/learn/library')}
            className="alc-button-secondary text-sm px-4 py-2"
          >
            返回题库
          </button>
        </div>
      </main>
    )
  }

  if (empty) {
    return (
      <main className="alc-page">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center space-y-4">
          <p className="text-sm text-fg-secondary">没有需要重刷的错题</p>
          <button
            type="button"
            onClick={() => router.push('/learn/library')}
            className="alc-button-secondary text-sm px-4 py-2"
          >
            返回题库
          </button>
        </div>
      </main>
    )
  }

  // Results summary
  if (isFinished && session) {
    const passed = session.results.filter((r) => r.passed).length
    const total = session.results.length
    const rate = total > 0 ? Math.round((passed / total) * 100) : 0

    return (
      <main className="alc-page">
        <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 text-center space-y-6">
          <p className="text-lg font-medium text-fg-primary">重刷完成</p>
          <p className="text-3xl font-bold text-accent-primary">{rate}%</p>
          <p className="text-sm text-fg-secondary">
            正确 {passed} / 共 {total} 题
          </p>
          <button
            type="button"
            onClick={handleEnd}
            className="alc-button-primary text-sm px-4 py-2"
          >
            返回题库
          </button>
        </div>
      </main>
    )
  }

  if (!currentQuiz || !session) return null

  const progress = `${session.currentIndex + 1} / ${session.queue.length}`

  return (
    <main className="alc-page">
      <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="alc-label">错题重刷</p>
            <h1 className="text-lg font-medium text-fg-primary">复习模式</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-fg-tertiary">{progress}</span>
            <button
              type="button"
              onClick={handleEnd}
              className="alc-button-secondary text-xs px-3 py-1.5"
            >
              退出
            </button>
          </div>
        </div>

        {/* Quiz */}
        <div className="space-y-4">
          <QuizRenderer
            quiz={currentQuiz}
            disabled={phase !== 'answering'}
            onAnswer={handleAnswer}
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
              explanation={currentQuiz.explanation}
              misconception={currentQuiz.misconception}
              extendedKnowledge={currentQuiz.extendedKnowledge}
            />

            <div className="pt-2 space-y-2">
              <button
                onClick={handleNext}
                className="w-full py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm hover:bg-accent-primary-hover transition-colors"
              >
                {session.currentIndex + 1 >= session.queue.length ? '查看结果' : '下一题'}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
