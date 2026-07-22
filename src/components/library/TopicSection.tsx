'use client'

/**
 * TopicSection — 主题区域：TopicCard + 模块行列表（M8.1 Task 4）
 */

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { Topic } from '@/types/domain'
import type { StoredModuleSummary } from '@/lib/persistence/module-library'
import {
  loadStoredModule,
  renameModule,
  resetStoredModuleProgress,
} from '@/lib/persistence/module-library'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { removeModule } from '@/lib/persistence/quota'
import { getStorage } from '@/lib/persistence/client/storage'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import type { ProgressState } from '@/types/domain'

import { TopicCard } from './TopicCard'
import { ModuleLibraryRow } from './ModuleLibraryList'
import { exportModuleToBrowserDownload } from './ModuleImportExport'

interface TopicSectionProps {
  topic: Topic
  modules: StoredModuleSummary[]
  onEdit: (topic: Topic) => void
  onChanged: () => void
}

export function TopicSection({ topic, modules, onEdit, onChanged }: TopicSectionProps) {
  const router = useRouter()
  const repository = getStorage()
  const [expanded, setExpanded] = useState(false)
  const setModule = useModuleStore((s) => s.setModule)
  const startModule = useProgressStore((s) => s.startModule)
  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)

  const handleOpen = (summary: StoredModuleSummary) => {
    const storedModule = loadStoredModule(repository, summary.id)
    if (!storedModule) return
    setModule(storedModule)
    const storedProgress = repository.get<ProgressState>(StorageKeys.progress(storedModule.id))
    const activeProgress = useProgressStore.getState()
    const hasActiveProgress =
      activeProgress.moduleId === storedModule.id && activeProgress.stage !== null
    if (summary.completed || (!storedProgress && !hasActiveProgress)) {
      router.push('/learn/overview')
    } else {
      router.push(`/learn/module/${storedModule.id}`)
    }
  }

  const handleRestart = (summary: StoredModuleSummary) => {
    const storedModule = loadStoredModule(repository, summary.id)
    if (!storedModule) return
    resetStoredModuleProgress(repository, summary.id)
    setModule(storedModule)
    startModule(storedModule.id)
    router.push('/learn/overview')
  }

  const handleDeleteRequest = (summary: StoredModuleSummary) => {
    removeModule(repository, summary.id)
    const currentId = useModuleStore.getState().currentModule?.id
    if (currentId === summary.id) {
      useModuleStore.getState().clear()
    }
    onChanged()
  }

  const handleExport = (summary: StoredModuleSummary) => {
    exportModuleToBrowserDownload(summary.id)
  }

  const handleRename = (moduleId: string, newTitle: string) => {
    const storedModule = loadStoredModule(repository, moduleId)
    if (!storedModule) return
    if (storedModule.origin === 'showcase') return
    renameModule(repository, moduleId, newTitle)
    const current = useModuleStore.getState().currentModule
    if (current?.id === moduleId) {
      useModuleStore.getState().renameCurrentModule(newTitle)
    }
    onChanged()
  }

  return (
    <section className="space-y-3">
      <TopicCard
        topic={topic}
        modules={modules}
        onEdit={onEdit}
        onChanged={onChanged}
        showModuleList={false}
      />

      {modules.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-between rounded-lg border border-border-subtle bg-bg-surface/40 px-4 py-2.5 text-left text-xs text-fg-secondary transition-colors hover:border-border-default hover:bg-bg-surface"
          >
            <span>{expanded ? '收起模块列表' : `展开 ${modules.length} 个模块`}</span>
            <span aria-hidden="true" className="text-fg-tertiary">
              {expanded ? '▴' : '▾'}
            </span>
          </button>
          {expanded && (
            <ul className="space-y-3">
              {modules.map((m) => (
                <ModuleLibraryRow
                  key={m.id}
                  module={m}
                  attemptsBySlot={attemptsBySlot}
                  onOpen={handleOpen}
                  onRestart={handleRestart}
                  onDeleteRequest={handleDeleteRequest}
                  onExport={handleExport}
                  onRename={handleRename}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
