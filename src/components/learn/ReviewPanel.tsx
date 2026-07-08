'use client'

interface ReviewPanelProps {
  title: string
  stem: string
  userAnswer?: string
  answer: string
  explanation: string
  onClose: () => void
}

export function ReviewPanel({
  title,
  stem,
  userAnswer,
  answer,
  explanation,
  onClose,
}: ReviewPanelProps) {
  return (
    <section className="alc-card-elevated p-5 space-y-4" aria-label={title}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="alc-label uppercase tracking-wider">{title}</p>
          <h2 className="mt-2 text-base leading-relaxed text-fg-primary">{stem}</h2>
        </div>
        <button type="button" onClick={onClose} className="alc-button-secondary shrink-0 text-xs">
          返回当前题
        </button>
      </div>

      {userAnswer && (
        <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
          <p className="alc-label">你的作答</p>
          <p className="mt-1 text-sm text-fg-secondary whitespace-pre-wrap">{userAnswer}</p>
        </div>
      )}

      <div className="rounded-md border border-success/30 bg-success-soft p-3">
        <p className="alc-label text-success">参考答案</p>
        <p className="mt-1 text-sm text-fg-primary whitespace-pre-wrap">{answer}</p>
      </div>

      <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
        <p className="alc-label">解析</p>
        <p className="mt-1 text-sm leading-relaxed text-fg-secondary">{explanation}</p>
      </div>
    </section>
  )
}
