'use client'

import type React from 'react'

import { LearnNavTop } from './LearnNavTop'

interface LearnShellProps {
  stageLabel: string
  children: React.ReactNode
}

export function LearnShell({ stageLabel, children }: LearnShellProps) {
  return (
    <div className="alc-learn-shell min-h-screen bg-bg-base text-fg-primary">
      <LearnNavTop stageLabel={stageLabel} />
      <main className="alc-learn-main">{children}</main>
    </div>
  )
}
