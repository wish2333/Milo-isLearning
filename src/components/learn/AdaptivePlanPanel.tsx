'use client'

interface AdaptivePlanPanelProps {
  rationale: string
}

export function AdaptivePlanPanel({ rationale }: AdaptivePlanPanelProps) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-surface/40 p-4 text-sm text-fg-secondary">
      <p className="text-xs uppercase tracking-wider text-fg-tertiary">下一步安排</p>
      <p className="mt-2 leading-relaxed">{rationale}</p>
    </div>
  )
}
