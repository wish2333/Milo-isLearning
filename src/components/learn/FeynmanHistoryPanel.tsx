'use client'

import type { FeynmanAttempt, FeynmanStep } from '@/types/domain'

interface FeynmanHistoryPanelProps {
  steps: FeynmanStep[]
  attempt: FeynmanAttempt | null
  currentStepOrder: number
  onClose: () => void
}

/** 费曼步骤作答历史：集中回看已完成步骤，不改变当前学习位置。 */
export function FeynmanHistoryPanel({
  steps,
  attempt,
  currentStepOrder,
  onClose,
}: FeynmanHistoryPanelProps) {
  const results = (attempt?.stepResults ?? [])
    .filter((result) => result.stepOrder <= 5)
    .sort((a, b) => a.stepOrder - b.stepOrder)

  return (
    <section className="alc-card-elevated p-5 space-y-4" aria-label="费曼作答历史">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="alc-label uppercase tracking-wider">作答历史</p>
          <h2 className="mt-2 text-base text-fg-primary">费曼步骤回看</h2>
          <p className="mt-1 text-xs text-fg-tertiary">只回看已提交内容，不会改变当前步骤。</p>
        </div>
        <button type="button" onClick={onClose} className="alc-button-secondary shrink-0 text-xs">
          返回当前题
        </button>
      </div>

      {results.length === 0 ? (
        <p className="rounded-md border border-border-subtle bg-bg-surface p-3 text-sm text-fg-tertiary">
          完成第一步后，这里会显示你的作答记录。
        </p>
      ) : (
        <div className="space-y-3">
          {results.map((result) => {
            const step = steps.find((item) => item.order === result.stepOrder)
            if (!step) return null
            const passed = result.score >= 80
            const isCurrent = result.stepOrder === currentStepOrder

            return (
              <article
                key={result.stepOrder}
                className={`rounded-md border p-4 space-y-3 ${
                  isCurrent
                    ? 'border-accent-primary/40 bg-accent-primary-soft/40'
                    : 'border-border-subtle bg-bg-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="alc-label">步骤 {result.stepOrder}</p>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      passed ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
                    }`}
                  >
                    {passed ? '已掌握' : '待巩固'} · {result.score} 分
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-fg-primary">{step.stem}</p>
                <div className="rounded-md border border-border-subtle/70 bg-bg-base/40 p-3">
                  <p className="alc-label">你的作答</p>
                  <p className="mt-1 text-sm text-fg-secondary whitespace-pre-wrap">
                    {result.userAnswer || '旧记录未保存作答文本'}
                  </p>
                </div>
                <div className="rounded-md border border-success/30 bg-success-soft/40 p-3">
                  <p className="alc-label text-success">参考答案</p>
                  <p className="mt-1 text-sm text-fg-primary whitespace-pre-wrap">{step.answer}</p>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
