'use client'

interface BackgroundPanelProps {
  background?: string
}

export function BackgroundPanel({ background }: BackgroundPanelProps) {
  if (!background) return null

  return (
    <section
      className="alc-context-panel rounded-lg border border-border-default bg-bg-surface/50 p-4 text-sm leading-relaxed text-fg-secondary"
      aria-label="题目前背景"
    >
      <p>{background}</p>
    </section>
  )
}
