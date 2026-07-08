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

import { isFillBlankCorrect } from '@/lib/runtime/fill-blank'
import type { Quiz } from '@/types/domain'

import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'

import { ChoiceQuiz } from '@/components/quiz/ChoiceQuiz'
import { FillBlankQuiz } from '@/components/quiz/FillBlankQuiz'

interface FeynmanStepViewProps {
  stepOrder: 1 | 2 | 3 | 4 | 5
}

export function FeynmanStepView({ stepOrder }: FeynmanStepViewProps) {
  const currentModule = useModuleStore((s) => s.currentModule)
  const recordFeynmanStep = useProgressStore((s) => s.recordFeynmanStep)
  const advance = useProgressStore((s) => s.advance)

  const [submitted, setSubmitted] = useState(false)
  const [userAnswer, setUserAnswer] = useState<string | null>(null)

  const step = currentModule?.feynmanTask.steps[stepOrder - 1] ?? null

  const handleAnswer = useCallback(
    (answer: string) => {
      if (!step) return
      setUserAnswer(answer)
      setSubmitted(true)

      // 评分：精确匹配 = 100，否则 = 0（费曼步不调 LLM）
      // fill_blank 使用标准化匹配（大小写/全角/空白）
      const score =
        step.type === 'fill_blank'
          ? isFillBlankCorrect(answer, step.answer)
            ? 100
            : 0
          : answer.trim() === step.answer.trim()
            ? 100
            : 0
      recordFeynmanStep(stepOrder, score)
    },
    [step, stepOrder, recordFeynmanStep],
  )

  useEffect(() => {
    setSubmitted(false)
    setUserAnswer(null)
  }, [stepOrder])

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
    distractors: [],
  }

  const passed = userAnswer !== null && userAnswer.trim() === step.answer.trim()

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Progress */}
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <span>费曼练习</span>
          <span>·</span>
          <span>步骤 {stepOrder} / 5</span>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-0.5 flex-1 rounded-full ${
                s <= stepOrder ? 'bg-neutral-300' : 'bg-neutral-800'
              }`}
            />
          ))}
        </div>

        {/* Quiz */}
        <div className="pt-2">
          {step.type === 'choice' ? (
            <ChoiceQuiz quiz={quiz} disabled={submitted} onAnswer={handleAnswer} />
          ) : (
            <FillBlankQuiz quiz={quiz} disabled={submitted} onAnswer={handleAnswer} />
          )}
        </div>

        {/* Feedback */}
        {submitted && (
          <div className="space-y-3">
            <div
              className={`rounded-lg border p-4 space-y-2 ${
                passed
                  ? 'border-emerald-700/30 bg-emerald-950/10'
                  : 'border-amber-700/30 bg-amber-950/10'
              }`}
            >
              <p className={`text-sm ${passed ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>
                {passed ? '答对了' : '再看看'}
              </p>
              <p className="text-xs text-neutral-500 leading-relaxed">{step.explanation}</p>
            </div>

            <button
              onClick={advance}
              className="w-full py-3 rounded-lg bg-neutral-100 text-neutral-900 font-medium text-sm hover:bg-white transition-colors"
            >
              {stepOrder < 5 ? '下一步' : '进入最终任务'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
