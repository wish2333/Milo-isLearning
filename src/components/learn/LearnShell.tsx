'use client'

import type React from 'react'

import { LearnNavTop } from './LearnNavTop'

interface LearnShellProps {
  moduleId?: string
  stageLabel: string
  children: React.ReactNode
}

export function LearnShell({ moduleId, stageLabel, children }: LearnShellProps) {
  return (
    <div className="alc-learn-shell min-h-screen bg-bg-base text-fg-primary">
      <LearnNavTop moduleId={moduleId} stageLabel={stageLabel} />
      <main className="alc-learn-main">{children}</main>
    </div>
  )
}
