'use client'

/**
 * FeynmanStepView — 费曼步骤 1-5
 *
 * 对应 docs/M4-M5-Plan.md W6 / FR-06。
 *
 * 行为（FR-06 约束）：
 *   - 答错不重试（费曼脚手架低焦虑），显示 explanation 后 advance
 *   - Step 1-4：Choice 题（复用 ChoiceQuiz 组件）
 *   - Step 5：Fill Blank 题（复用 FillBlankQuiz 组件）
 */

import { useState, useCallback, useEffect } from 'react'

import { isFillBlankAnswerAccepted } from '@/lib/runtime/fill-blank'
import { track } from '@/lib/runtime/analytics'
import type { Quiz } from '@/types/domain'

import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'

import { ChoiceQuiz } from '@/components/quiz/ChoiceQuiz'
import { FillBlankQuiz } from '@/components/quiz/FillBlankQuiz'
import { FeedbackPanel } from '@/components/quiz/FeedbackPanel'
import { FeynmanHistoryPanel } from '@/components/learn/FeynmanHistoryPanel'
import { StaircaseProgress } from '@/components/learn/StaircaseProgress'
import type { QuizEditPatch } from '@/components/quiz/AnswerCorrector'

interface FeynmanStepViewProps {
  stepOrder: 1 | 2 | 3 | 4 | 5
}

export function FeynmanStepView({ stepOrder }: FeynmanStepViewProps) {
  const currentModule = useModuleStore((s) => s.currentModule)
  const feynmanAttempt = useProgressStore((s) => s.feynmanAttempt)
  const recordFeynmanStep = useProgressStore((s) => s.recordFeynmanStep)
  const advance = useProgressStore((s) => s.advance)
  const updateFeynmanStep = useModuleStore((s) => s.updateFeynmanStep)

  const [submitted, setSubmitted] = useState(false)
  const [userAnswer, setUserAnswer] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const step = currentModule?.feynmanTask.steps[stepOrder - 1] ?? null

  const scoreAnswer = useCallback(
    (answer: string, targetStep = step) => {
      if (!targetStep) return 0
      return targetStep.type === 'fill_blank'
        ? isFillBlankAnswerAccepted(answer, targetStep.answer, targetStep.acceptableAnswers)
          ? 100
          : 0
        : answer.trim() === targetStep.answer.trim()
          ? 100
          : 0
    },
    [step],
  )

  const handleAnswer = useCallback(
    (answer: string) => {
      if (!step) return
      setUserAnswer(answer)
      setSubmitted(true)

      // 评分：精确匹配 = 100，否则 = 0（费曼步不调 LLM）
      // fill_blank 使用标准化匹配（大小写/全角/空白）
      const score = scoreAnswer(answer, step)
      recordFeynmanStep(stepOrder, score, answer)
      track('feynman_step_submit', { stepOrder, correct: score >= 80 })
    },
    [step, stepOrder, recordFeynmanStep, scoreAnswer],
  )

  useEffect(() => {
    setSubmitted(false)
    setUserAnswer(null)
    setHistoryOpen(false)
  }, [stepOrder])

  const handleCorrectAnswer = useCallback(
    (patch: QuizEditPatch) => {
      if (!step) return
      const correctedStep = { ...step, ...patch }
      updateFeynmanStep(step.order, patch)
      if (userAnswer !== null) {
        const correctedScore = scoreAnswer(userAnswer, correctedStep)
        recordFeynmanStep(stepOrder, correctedScore, userAnswer)
      }
    },
    [recordFeynmanStep, scoreAnswer, step, stepOrder, updateFeynmanStep, userAnswer],
  )

  if (!currentModule || !step) return null

  // 把 FeynmanStep 包装成 Quiz 供组件复用
  const quiz: Quiz = {
    id: `feynman-step-${stepOrder}`,
    conceptId: currentModule.id,
    ladderLevel: 1,
    expressionLevel: step.type === 'choice' ? 1 : 3,
    interactionType: step.type,
    stem: step.stem,
    options: step.options,
    answer: step.answer,
    explanation: step.explanation,
    answerHint: step.answerHint,
    acceptableAnswers: step.acceptableAnswers,
    misconception: step.misconception,
    extendedKnowledge: step.extendedKnowledge,
    evaluationMode: step.evaluationMode,
    distractors: [],
  }

  const passed =
    userAnswer !== null &&
    (step.type === 'fill_blank'
      ? isFillBlankAnswerAccepted(userAnswer, step.answer, step.acceptableAnswers)
      : userAnswer.trim() === step.answer.trim())

  return (
    <div className="text-fg-primary">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Progress */}
        <div className="flex items-center gap-2 text-xs text-fg-quaternary">
          <span>费曼练习</span>
          <span>·</span>
          <span>步骤 {stepOrder} / 5</span>
        </div>

        <StaircaseProgress total={5} current={stepOrder - 1} stage="feynman" />

        {feynmanAttempt && feynmanAttempt.stepResults.length > 0 && !historyOpen && (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="alc-button-secondary text-xs px-3 py-1.5"
          >
            作答历史 ({feynmanAttempt.stepResults.length})
          </button>
        )}

        {historyOpen && (
          <FeynmanHistoryPanel
            steps={currentModule.feynmanTask.steps}
            attempt={feynmanAttempt}
            currentStepOrder={stepOrder}
            onClose={() => setHistoryOpen(false)}
          />
        )}

        {/* Quiz */}
        <div className="pt-2">
          {step.type === 'choice' ? (
            <ChoiceQuiz
              quiz={quiz}
              disabled={submitted}
              onAnswer={handleAnswer}
              submittedAnswer={submitted ? (userAnswer ?? undefined) : undefined}
            />
          ) : (
            <FillBlankQuiz quiz={quiz} disabled={submitted} onAnswer={handleAnswer} />
          )}
        </div>

        {/* Feedback */}
        {submitted && (
          <div className="space-y-3">
            <FeedbackPanel
              feedback={{
                score: passed ? 100 : 0,
                gaps: passed ? [] : [`标准答案：${step.answer}`],
                nextAction: passed ? 'advance' : 'retry',
                feedbackText: passed ? '答对了' : '再看看',
              }}
              explanation={step.explanation}
              misconception={step.misconception}
              extendedKnowledge={step.extendedKnowledge}
              canCorrect={currentModule.origin !== 'showcase'}
              quiz={quiz}
              onCorrectAnswer={handleCorrectAnswer}
            />

            <button
              onClick={advance}
              className="w-full py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm hover:bg-accent-primary-hover transition-colors"
            >
              {stepOrder < 5 ? '下一步' : '进入最终任务'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
