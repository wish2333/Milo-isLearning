'use client'

export function ReviewSlotBadge({ moduleName }: { moduleName?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-surface/60 px-2 py-0.5 text-xs text-fg-tertiary">
      <span className="text-amber-400/70">&#8635;</span>
      {moduleName ? `复习 · 来自《${moduleName}》` : '复习题'}
    </span>
  )
}
