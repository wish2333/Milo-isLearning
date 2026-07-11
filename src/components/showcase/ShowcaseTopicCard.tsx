'use client'

import type { ShowcaseTopicEntry } from '@/lib/showcase/showcase-loader'

interface ShowcaseTopicCardProps {
  entry: ShowcaseTopicEntry
  onStart: (entry: ShowcaseTopicEntry) => void
}

export function ShowcaseTopicCard({ entry, onStart }: ShowcaseTopicCardProps) {
  return (
    <div className="alc-card p-5 space-y-3 h-full flex flex-col">
      <div className="flex items-start gap-2">
        <span className="text-lg">📁</span>
        <div className="flex-1 min-w-0">
          <p className="text-fg-primary font-medium">{entry.name}</p>
          <p className="alc-label mt-0.5 text-xs">{entry.description}</p>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-fg-tertiary">包含 {entry.moduleCount} 个题库</p>
      </div>

      <button
        type="button"
        onClick={() => onStart(entry)}
        className="alc-button-primary text-sm w-full mt-auto"
      >
        体验主题学习
      </button>
    </div>
  )
}
