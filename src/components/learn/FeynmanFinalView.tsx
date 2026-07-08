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
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useSettingsStore } from '@/lib/state/settings-store'

const MIN_WORDS = 100
const MAX_WORDS = 500
const MAX_SUBMITS = 2

export function FeynmanFinalView() {
  const currentModule = useModuleStore((s) => s.currentModule)
  const config = useSettingsStore((s) => s.config)
  const submitFeynman = useProgressStore((s) => s.submitFeynman)

  const [output, setOutput] = useState('')
  const [submitCount, setSubmitCount] = useState(0)
  const [evaluating, setEvaluating] = useState(false)
  const [result, setResult] = useState<FeynmanEvalOutput | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    submitFeynman(output, result.score, result.gaps)
  }, [result, output, submitFeynman, currentModule])

  if (!currentModule) return null

  const { finalPrompt } = currentModule.feynmanTask
  const charCount = output.length
  const canSubmit = charCount >= MIN_WORDS && charCount <= MAX_WORDS && !evaluating
  const hasResult = result !== null
  const canRetry = submitCount < MAX_SUBMITS

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <p className="text-xs text-neutral-600 uppercase tracking-wider">费曼最终任务</p>
          <h2 className="text-xl font-semibold">{finalPrompt}</h2>
        </div>

        {/* Text output */}
        <div className="space-y-2">
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            disabled={hasResult && !canRetry}
            placeholder="用你自己的话，写出对以上知识的完整解释..."
            className="w-full h-64 bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 resize-none"
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-600">{charCount} 字</span>
            <span className={charCount < MIN_WORDS ? 'text-amber-500/60' : 'text-neutral-600'}>
              建议 {MIN_WORDS}-{MAX_WORDS} 字
            </span>
          </div>
        </div>

        {/* Submit button */}
        {!hasResult && (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-3 rounded-lg bg-neutral-100 text-neutral-900 font-medium text-sm hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
          >
            {evaluating ? '正在评估...' : '提交评估'}
          </button>
        )}

        {/* Error */}
        {error && <p className="text-sm text-red-400/80">{error}</p>}

        {/* Evaluation result */}
        {result && (
          <div className="space-y-4">
            {/* Score */}
            <div className="flex items-center gap-4 py-4 border-y border-neutral-800">
              <div className="text-3xl font-light tabular-nums">
                {result.score}
                <span className="text-sm text-neutral-600">/100</span>
              </div>
              <div className="flex-1">
                <p className="text-xs text-neutral-600">费曼得分</p>
              </div>
            </div>

            {/* Rubric results */}
            <div className="space-y-2">
              <p className="text-xs text-neutral-600 uppercase tracking-wider">评分细则</p>
              {result.rubricResults.map((r) => (
                <div key={r.point} className="flex items-start justify-between gap-3 py-2">
                  <div className="flex-1">
                    <p className="text-sm text-neutral-300">{r.point}</p>
                    <p className="text-xs text-neutral-600 mt-0.5">{r.comment}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      r.hit === 'full'
                        ? 'bg-emerald-950/30 text-emerald-400/70'
                        : r.hit === 'partial'
                          ? 'bg-amber-950/30 text-amber-400/70'
                          : 'bg-neutral-800/50 text-neutral-500'
                    }`}
                  >
                    {r.hit === 'full' ? '完全命中' : r.hit === 'partial' ? '部分命中' : '未命中'}
                  </span>
                </div>
              ))}
            </div>

            {/* Sample answer */}
            <div className="space-y-2">
              <p className="text-xs text-neutral-600 uppercase tracking-wider">参考范文</p>
              <div className="bg-neutral-900/50 rounded-lg p-4 border border-neutral-800/50">
                <p className="text-sm text-neutral-400 leading-relaxed whitespace-pre-wrap">
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
                  className="flex-1 py-3 rounded-lg border border-neutral-700 text-neutral-300 font-medium text-sm hover:bg-neutral-900 transition-colors"
                >
                  重写一次 ({submitCount}/{MAX_SUBMITS})
                </button>
              ) : null}
              <button
                onClick={handleFinish}
                className="flex-1 py-3 rounded-lg bg-neutral-100 text-neutral-900 font-medium text-sm hover:bg-white transition-colors"
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
