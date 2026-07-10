'use client'

import type { ShowcaseManifestEntry } from '@/lib/showcase/showcase-loader'

interface Props {
  entry: ShowcaseManifestEntry
  onStart: (entry: ShowcaseManifestEntry) => void
}

export function ShowcaseModuleCard({ entry, onStart }: Props) {
  return (
    <div className="alc-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-medium text-fg-primary">{entry.title}</h3>
        {entry.featured && <span className="alc-muted text-xs whitespace-nowrap">★ 推荐</span>}
      </div>
      <p className="text-sm leading-relaxed text-fg-secondary">{entry.description}</p>
      <button onClick={() => onStart(entry)} className="alc-button-primary text-sm w-full">
        开始学习
      </button>
    </div>
  )
}
