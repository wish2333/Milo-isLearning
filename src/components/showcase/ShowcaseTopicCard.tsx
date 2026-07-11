'use client'

import type { ShowcaseTopicEntry } from '@/lib/showcase/showcase-loader'

interface ShowcaseTopicCardProps {
  entry: ShowcaseTopicEntry
  onStart: (entry: ShowcaseTopicEntry) => void
}

export function ShowcaseTopicCard({ entry, onStart }: ShowcaseTopicCardProps) {
  return (
    <div className="alc-card p-5 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-lg">📁</span>
        <div className="flex-1 min-w-0">
          <p className="text-fg-primary font-medium">{entry.name}</p>
          <p className="alc-label mt-0.5 text-xs">{entry.description}</p>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-fg-tertiary">包含 {entry.modulePackages.length} 个题库：</p>
        <ul className="space-y-0.5">
          {entry.modulePackages.map((mp) => (
            <li key={mp.package} className="text-xs text-fg-secondary flex items-center gap-1">
              <span className="text-fg-quaternary">•</span>
              {mp.title}
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => onStart(entry)}
        className="alc-button-primary text-sm w-full"
      >
        体验主题学习
      </button>
    </div>
  )
}
