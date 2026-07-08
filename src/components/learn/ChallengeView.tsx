'use client'

/**
 * ChallengeView — Module Challenge 跨概念综合题视图
 *
 * 对应 docs/M6-Plan.md W3 / FR-05 / US-13/14。
 *
 * 与 ConceptView 的差异：
 *   - 数据源：module.challengeQuizzes[quizIndex]（非 concept.quizSeries.quizzes）
 *   - slotId：quiz.id（challenge-N 格式）
 *   - 视觉：amber 主色调（与 Concept 页的 neutral 区分，强调综合挑战感）
 *   - retry：合成 Challenge 上下文 Concept 调用 /api/regenerate
 *
 * 共享逻辑模式与 ConceptView 一致（QuizRenderer + FeedbackPanel + retry-policy）
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
import type { AttemptRecord, Concept, Quiz } from '@/types/domain'

import { FeedbackPanel } from '@/components/quiz/FeedbackPanel'
import { QuizRenderer } from '@/components/quiz/QuizRenderer'
import { ReviewPanel } from '@/components/learn/ReviewPanel'

interface ChallengeViewProps {
  quizIndex: number
}

type Phase = 'answering' | 'evaluating' | 'feedback' | 'regenerating'

export function ChallengeView({ quizIndex }: ChallengeViewProps) {
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
  const [reviewOpen, setReviewOpen] = useState(false)

  // 获取当前应该显示的 Challenge quiz
  const slotQuiz = currentModule?.challengeQuizzes?.[quizIndex]
  const quiz: Quiz | null = currentQuiz ?? slotQuiz ?? null

  // 进入新题时重置状态并同步 currentQuiz
  useEffect(() => {
    setPhase('answering')
    setFeedback(null)
    setForceAdvance(false)
    setError(null)
    setReviewOpen(false)
    // 如果 currentQuiz 不属于当前 challenge slot，重置为 slot quiz
    if (slotQuiz && (!currentQuiz || currentQuiz.id !== slotQuiz.id)) {
      if (!currentQuiz || currentQuiz.conceptId !== 'challenge') {
        setCurrentQuiz(slotQuiz)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizIndex])

  const slotId = slotQuiz?.id ?? ''
  const previousQuiz = quizIndex > 0 ? currentModule?.challengeQuizzes?.[quizIndex - 1] : null
  const previousAttempt = previousQuiz ? getAttempts(previousQuiz.id).at(-1) : undefined

  const handleAnswer = useCallback(
    async (userAnswer: string) => {
      if (!quiz || !currentModule) return
      if (phase !== 'answering') return

      setPhase('evaluating')
      setError(null)

      // 一次性快照 attemptVersion，避免记录作答时出现竞态
      const attemptVersion = getNextAttemptVersion(slotId)

      try {
        const result = evaluateAnswer(quiz, userAnswer)

        // 记录 AttemptRecord（attemptVersion 已在函数入口快照）
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
    clearCurrentQuiz()
    advance()
  }, [clearCurrentQuiz, advance])

  const handleRetry = useCallback(async () => {
    if (!quiz || !config || !currentModule) return

    setPhase('regenerating')
    setError(null)

    try {
      // 合成 Challenge 上下文 Concept（包含全部 Concept 信息供 Quiz Agent 参考）
      const challengeContext: Concept = {
        id: 'challenge',
        moduleId: currentModule.id,
        name: 'Module Challenge',
        definition: currentModule.concepts.map((c) => `${c.name}: ${c.definition}`).join('\n'),
        type: 'theory',
        keyPoints: currentModule.concepts.flatMap((c) => c.keyPoints),
        quizSeries: { conceptId: 'challenge', quizzes: [] },
        order: 0,
      }

      const response = await fetch('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeholder: {
            id: slotId,
            conceptId: 'challenge',
            ladderLevel: quiz.ladderLevel,
            expressionLevel: quiz.expressionLevel,
            interactionType: quiz.interactionType,
          },
          concept: challengeContext,
          moduleContext: { title: currentModule.title, intro: currentModule.intro },
          originalQuiz: quiz,
          llmConfig: config,
        }),
      })

      if (!response.ok) {
        throw new Error(`Regenerate API 失败: ${response.status}`)
      }

      const data: { quiz: Quiz } = await response.json()

      // 重写 id 和 conceptId 保持 challenge slot 一致性
      const challengeQuiz: Quiz = {
        ...data.quiz,
        id: slotId,
        conceptId: 'challenge',
      }
      replaceCurrentQuiz(challengeQuiz)
      retry()

      setPhase('answering')
      setFeedback(null)
      setForceAdvance(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '题目生成失败，请重试')
      setPhase('feedback')
    }
  }, [quiz, config, currentModule, slotId, replaceCurrentQuiz, retry])

  // --- 渲染 ---

  if (!quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-500">
        <p>题目加载中...</p>
      </div>
    )
  }

  const isAdvancing = feedback?.nextAction === 'advance' || forceAdvance
  const challengeCount = currentModule?.challengeQuizzes?.length ?? 0

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Progress indicator — amber 色调区分 */}
        <div className="flex items-center gap-2 text-xs text-amber-500/70">
          <span>
            Module Challenge {quizIndex + 1}/{challengeCount}
          </span>
          <span>·</span>
          <span>跨概念综合题</span>
        </div>

        {/* Challenge banner */}
        <div className="border-l-2 border-amber-700/40 pl-4 py-1">
          <p className="text-xs text-amber-600/80 uppercase tracking-wider">综合挑战</p>
          <p className="text-sm text-amber-300/60 mt-0.5">以下题目涉及多个概念的综合应用</p>
        </div>

        {previousQuiz && !reviewOpen && (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="alc-button-secondary text-xs px-3 py-1.5"
          >
            回看上一题
          </button>
        )}

        {previousQuiz && reviewOpen && (
          <ReviewPanel
            title="上一题"
            stem={previousQuiz.stem}
            userAnswer={previousAttempt?.userAnswer}
            answer={previousQuiz.answer}
            explanation={previousQuiz.explanation}
            onClose={() => setReviewOpen(false)}
          />
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
                  className="w-full py-3 rounded-lg bg-amber-100 text-amber-950 font-medium text-sm hover:bg-amber-50 transition-colors"
                >
                  继续
                </button>
              ) : (
                <button
                  onClick={handleRetry}
                  className="w-full py-3 rounded-lg border border-amber-700/50 text-amber-300 font-medium text-sm hover:bg-amber-950/30 transition-colors"
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
