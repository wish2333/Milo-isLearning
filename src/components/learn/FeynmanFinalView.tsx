'use client'

/**
 * FeynmanFinalView — 费曼最终输出（Step 6）
 *
 * 对应 docs/M4-M5-Plan.md W6/W7 / FR-06 AC3-8。
 *
 * 行为：
 *   - 开放文本输出，建议 100-500 字
 *   - 提交 → POST /api/feynman-eval → Rubric 评分 + sampleAnswer
 *   - 显示评分结果和范文
 *   - 允许"重写一次"（最多 2 次提交）
 *   - 最终 submit → progress-store.submitFeynman() → done
 */

import { useState, useCallback } from 'react'

import type { FeynmanEvalOutput } from '@/lib/compiler/schemas/feynman-eval'
import { track } from '@/lib/runtime/analytics'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import { FeynmanHistoryPanel } from '@/components/learn/FeynmanHistoryPanel'

const MIN_CHARS = 100
const MAX_CHARS = 500
const MAX_SUBMITS = 2

export function FeynmanFinalView() {
  const currentModule = useModuleStore((s) => s.currentModule)
  const config = useSettingsStore((s) => s.config)
  const submitFeynman = useProgressStore((s) => s.submitFeynman)
  const feynmanAttempt = useProgressStore((s) => s.feynmanAttempt)

  const [output, setOutput] = useState('')
  const [submitCount, setSubmitCount] = useState(0)
  const [evaluating, setEvaluating] = useState(false)
  const [result, setResult] = useState<FeynmanEvalOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!config || !currentModule) return

    setEvaluating(true)
    setError(null)

    try {
      const response = await fetch('/api/feynman-eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finalPrompt: currentModule.feynmanTask.finalPrompt,
          rubric: currentModule.feynmanTask.rubric,
          userOutput: output,
          llmConfig: config,
        }),
      })

      if (!response.ok) {
        throw new Error(`Feynman-Eval API 失败: ${response.status}`)
      }

      const evalResult: FeynmanEvalOutput = await response.json()
      setResult(evalResult)
      setSubmitCount((c) => c + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : '评估失败，请重试')
    } finally {
      setEvaluating(false)
    }
  }, [config, currentModule, output])

  const handleFinish = useCallback(() => {
    if (!result || !currentModule) return
    track('feynman_final_submit', {
      finalScore: result.score,
      rubricHits: result.gaps?.length ?? 0,
    })
    submitFeynman(output, result.score, result.gaps)
  }, [result, output, submitFeynman, currentModule])

  if (!currentModule) return null

  const { finalPrompt } = currentModule.feynmanTask
  const charCount = output.length
  const canSubmit = charCount >= MIN_CHARS && charCount <= MAX_CHARS && !evaluating
  const hasResult = result !== null
  const canRetry = submitCount < MAX_SUBMITS

  return (
    <div className="text-fg-primary">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-fg-quaternary uppercase tracking-wider">费曼最终任务</p>
              <h2 className="mt-1 text-xl font-semibold">{finalPrompt}</h2>
            </div>
            {feynmanAttempt && feynmanAttempt.stepResults.length > 0 && !historyOpen && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="alc-button-secondary shrink-0 text-xs px-3 py-1.5"
              >
                作答历史 ({feynmanAttempt.stepResults.length})
              </button>
            )}
          </div>
        </div>

        {historyOpen && (
          <FeynmanHistoryPanel
            steps={currentModule.feynmanTask.steps}
            attempt={feynmanAttempt}
            currentStepOrder={6}
            onClose={() => setHistoryOpen(false)}
          />
        )}

        {/* Text output */}
        <div className="space-y-2">
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            disabled={hasResult && !canRetry}
            placeholder="用你自己的话，写出对以上知识的完整解释..."
            className="w-full h-64 bg-bg-surface border border-border-default rounded-lg p-4 text-sm text-fg-primary placeholder-fg-tertiary focus:outline-none focus:border-border-default resize-none"
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-quaternary">{charCount} 字</span>
            <span className={charCount < MIN_CHARS ? 'text-warning' : 'text-fg-quaternary'}>
              建议 {MIN_CHARS}-{MAX_CHARS} 字
            </span>
          </div>
        </div>

        {/* Submit button */}
        {!hasResult && (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm hover:bg-accent-primary-hover disabled:bg-bg-elevated disabled:text-fg-tertiary transition-colors"
          >
            {evaluating ? '正在评估...' : '提交评估'}
          </button>
        )}

        {/* Error */}
        {error && <p className="text-sm text-danger/80">{error}</p>}

        {/* Evaluation result */}
        {result && (
          <div className="space-y-4">
            {/* Score */}
            <div className="flex items-center gap-4 py-4 border-y border-border-default">
              <div className="text-3xl font-light tabular-nums">
                {result.score}
                <span className="text-sm text-fg-quaternary">/100</span>
              </div>
              <div className="flex-1">
                <p className="text-xs text-fg-quaternary">费曼得分</p>
              </div>
            </div>

            {/* Rubric results */}
            <div className="space-y-2">
              <p className="text-xs text-fg-quaternary uppercase tracking-wider">评分细则</p>
              {result.rubricResults.map((r) => (
                <div key={r.point} className="flex items-start justify-between gap-3 py-2">
                  <div className="flex-1">
                    <p className="text-sm text-fg-secondary">{r.point}</p>
                    <p className="text-xs text-fg-quaternary mt-0.5">{r.comment}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      r.hit === 'full'
                        ? 'bg-emerald-950/30 text-emerald-400/70'
                        : r.hit === 'partial'
                          ? 'bg-amber-950/30 text-amber-400/70'
                          : 'bg-bg-elevated/50 text-fg-tertiary'
                    }`}
                  >
                    {r.hit === 'full' ? '完全命中' : r.hit === 'partial' ? '部分命中' : '未命中'}
                  </span>
                </div>
              ))}
            </div>

            {/* Sample answer */}
            <div className="space-y-2">
              <p className="text-xs text-fg-quaternary uppercase tracking-wider">参考范文</p>
              <div className="bg-bg-surface/50 rounded-lg p-4 border border-border-subtle">
                <p className="text-sm text-fg-secondary leading-relaxed whitespace-pre-wrap">
                  {result.sampleAnswer}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              {canRetry ? (
                <button
                  onClick={() => {
                    setResult(null)
                    setOutput('')
                  }}
                  className="flex-1 py-3 rounded-lg border border-border-strong text-fg-secondary font-medium text-sm hover:bg-bg-elevated transition-colors"
                >
                  重写一次 ({submitCount}/{MAX_SUBMITS})
                </button>
              ) : null}
              <button
                onClick={handleFinish}
                className="flex-1 py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm hover:bg-accent-primary-hover transition-colors"
              >
                完成学习
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
