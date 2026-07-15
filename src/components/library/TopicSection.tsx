'use client'

/**
 * TopicSection — 主题区域：TopicCard + 模块行列表（M8.1 Task 4）
 */

import { useRouter } from 'next/navigation'

import type { Topic } from '@/types/domain'
import type { StoredModuleSummary } from '@/lib/persistence/module-library'
import {
  loadStoredModule,
  renameModule,
  resetStoredModuleProgress,
} from '@/lib/persistence/module-library'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { removeModule } from '@/lib/persistence/quota'
import { storage } from '@/lib/persistence/client/local-storage'
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
  const setModule = useModuleStore((s) => s.setModule)
  const startModule = useProgressStore((s) => s.startModule)
  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)

  const handleOpen = (summary: StoredModuleSummary) => {
    const storedModule = loadStoredModule(storage, summary.id)
    if (!storedModule) return
    setModule(storedModule)
    const storedProgress = storage.get<ProgressState>(StorageKeys.progress(storedModule.id))
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
    const storedModule = loadStoredModule(storage, summary.id)
    if (!storedModule) return
    resetStoredModuleProgress(storage, summary.id)
    setModule(storedModule)
    startModule(storedModule.id)
    router.push('/learn/overview')
  }

  const handleDeleteRequest = (summary: StoredModuleSummary) => {
    removeModule(storage, summary.id)
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
    const storedModule = loadStoredModule(storage, moduleId)
    if (!storedModule) return
    if (storedModule.origin === 'showcase') return
    renameModule(storage, moduleId, newTitle)
    const current = useModuleStore.getState().currentModule
    if (current?.id === moduleId) {
      useModuleStore.getState().renameCurrentModule(newTitle)
    }
    onChanged()
  }

  return (
    <section className="space-y-3">
      <TopicCard topic={topic} modules={modules} onEdit={onEdit} onChanged={onChanged} />

      {modules.length > 0 && (
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
    </section>
  )
}
