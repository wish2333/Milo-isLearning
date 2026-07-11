'use client'

/**
 * UngroupedSection — 未归类题库区域（M8.1 Task 4）
 */

import type { StoredModuleSummary } from '@/lib/persistence/module-library'

import { ModuleLibraryList } from './ModuleLibraryList'

interface UngroupedSectionProps {
  modules: StoredModuleSummary[]
  onChanged: () => void
}

export function UngroupedSection({ modules, onChanged }: UngroupedSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="alc-label uppercase tracking-wider">未归类题库（{modules.length}）</p>
      </div>
      <ModuleLibraryList modules={modules} onChanged={onChanged} />
    </section>
  )
}
