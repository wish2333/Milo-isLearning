'use client'

/**
 * 主题错题重刷页 — 跨库错题复习会话
 *
 * 从 library 的主题"重刷错题"按钮进入。
 * 扫描主题下所有模块的错题/蒙对题，随机顺序逐一作答。
 * 会话不持久化（刷新即丢失）。
 */

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { collectReviewItemsForModules } from '@/lib/runtime/topic-review'
import { evaluateAnswerAsync } from '@/lib/runtime/evaluate-answer'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useReviewStore } from '@/lib/state/review-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import { loadStoredModule } from '@/lib/persistence/module-library'
import { getTopic } from '@/lib/persistence/topic-library'
import { storage } from '@/lib/persistence/client/local-storage'
import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'
import type { ReviewFilter, Module, AttemptRecord } from '@/types/domain'

import { LearnShell } from '@/components/learn/LearnShell'
import { FeedbackPanel } from '@/components/quiz/FeedbackPanel'
import { QuizRenderer } from '@/components/quiz/QuizRenderer'
import { createProvider } from '@/lib/providers'
import { computeLearningTime } from '@/lib/runtime/learning-time'

type Phase = 'answering' | 'evaluating' | 'feedback'

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`筛选: ${label}${active ? ' (当前选中)' : ''}`}
      aria-pressed={active}
      className={`text-xs px-3 py-1.5 rounded transition-colors ${
        active ? 'alc-button-primary' : 'alc-button-secondary'
      }`}
    >
      {label}({count})
    </button>
  )
}

export default function TopicReviewPage() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams<{ topicId: string }>()
  const searchParams = useSearchParams()
  const hydrated = useHydrated()

  const currentFilter = (searchParams.get('filter') as ReviewFilter) ?? 'all'

  const { session, startTopicSession, recordResult, nextQuestion, endSession } = useReviewStore()
  const addAttempt = useAttemptsStore((s) => s.addAttempt)
  const getNextAttemptVersion = useAttemptsStore((s) => s.getNextAttemptVersion)
  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)
  const config = useSettingsStore((s) => s.config)

  const [phase, setPhase] = useState<Phase>('answering')
  const [feedback, setFeedback] = useState<FeedbackRuntime | null>(null)
  const [empty, setEmpty] = useState(false)
  /** 记录当前题目展示时间，用于计算答题耗时 */
  const quizDisplayStart = useRef<number>(Date.now())

  const initializedFor = useRef<string | null>(null)

  const topicModules = useMemo(() => {
    const topic = getTopic(storage, params.topicId!)
    if (!topic) return []
    return topic.moduleIds
      .map((id) => loadStoredModule(storage, id))
      .filter((m): m is Module => m !== null)
  }, [params.topicId])

  const counts = useMemo(
    () => ({
      all: collectReviewItemsForModules(topicModules, attemptsBySlot, 'all').length,
      wrong: collectReviewItemsForModules(topicModules, attemptsBySlot, 'wrong').length,
      guessed: collectReviewItemsForModules(topicModules, attemptsBySlot, 'guessed').length,
    }),
    [topicModules, attemptsBySlot],
  )

  const handleTabChange = useCallback(
    (newFilter: ReviewFilter) => {
      const target = newFilter === 'all' ? '' : `?filter=${newFilter}`
      router.replace(`${pathname}${target}`)
    },
    [router, pathname],
  )

  useEffect(() => {
    if (!hydrated || !params.topicId) return
    if (initializedFor.current === `${params.topicId}:${currentFilter}`) return
    initializedFor.current = `${params.topicId}:${currentFilter}`

    const started = startTopicSession(params.topicId, currentFilter)
    if (!started) {
      setEmpty(true)
    }
  }, [hydrated, params.topicId, currentFilter, startTopicSession])

  const currentQuiz = session ? (session.queue[session.currentIndex]?.quiz ?? null) : null
  const isFinished = session !== null && session.currentIndex >= session.queue.length

  // 当题目切换时记录展示时间
  useEffect(() => {
    if (currentQuiz && phase === 'answering') {
      quizDisplayStart.current = Date.now()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuiz?.id, phase])

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
          answeredAt: Date.now(),
          timeSpentMs: Date.now() - quizDisplayStart.current,
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
    setPhase('answering')
    setFeedback(null)
    nextQuestion()
  }, [session, nextQuestion])

  const handleEnd = useCallback(() => {
    endSession()
    router.push('/learn/library')
  }, [endSession, router])

  if (!hydrated) return null

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

    // 聚合本次复习的学习时长
    const reviewAttempts = session.queue
      .map((item) => attemptsBySlot[item.slotId])
      .filter((a): a is AttemptRecord[] => !!a && a.length > 0)
      .map((arr) => arr[arr.length - 1]!)
    const timeSummary = computeLearningTime(reviewAttempts)

    return (
      <main className="alc-page">
        <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 text-center space-y-6">
          <p className="text-lg font-medium text-fg-primary">重刷完成</p>
          <p className="text-3xl font-bold text-accent-primary">{rate}%</p>
          <p className="text-sm text-fg-secondary">
            正确 {passed} / 共 {total} 题
          </p>
          {timeSummary.hasTimeData && (
            <p className="text-xs text-fg-tertiary">
              本次复习时长：{timeSummary.formattedTotal}
              {' / '}
              平均每题：{timeSummary.formattedAvg}
            </p>
          )}
          {!timeSummary.hasTimeData && total > 0 && (
            <p className="text-xs text-fg-quaternary">时长未记录</p>
          )}
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
    <LearnShell stageLabel="主题重刷">
      <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="alc-label">主题错题重刷</p>
              <h1 className="text-lg font-medium text-fg-primary">复习模式</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-fg-tertiary">{progress}</span>
              <button
                type="button"
                onClick={handleEnd}
                aria-label="退出主题复习"
                className="alc-button-secondary text-xs px-3 py-1.5"
              >
                退出
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2">
            <FilterTab
              label="全部"
              count={counts.all}
              active={currentFilter === 'all'}
              onClick={() => handleTabChange('all')}
            />
            <FilterTab
              label="仅错题"
              count={counts.wrong}
              active={currentFilter === 'wrong'}
              onClick={() => handleTabChange('wrong')}
            />
            <FilterTab
              label="仅蒙对"
              count={counts.guessed}
              active={currentFilter === 'guessed'}
              onClick={() => handleTabChange('guessed')}
            />
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
    </LearnShell>
  )
}
