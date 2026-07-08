'use client'

import { useRouter } from 'next/navigation'

import { StorageKeys } from '@/lib/persistence/keys'
import { storage } from '@/lib/persistence/local-storage'
import { loadStoredModule, type StoredModuleSummary } from '@/lib/persistence/module-library'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import type { ProgressState } from '@/types/domain'

interface ModuleSwitcherProps {
  modules: StoredModuleSummary[]
  currentModuleId?: string
}

export function ModuleSwitcher({ modules, currentModuleId }: ModuleSwitcherProps) {
  const router = useRouter()
  const setModule = useModuleStore((s) => s.setModule)

  const handleChange = (moduleId: string) => {
    if (!moduleId) return
    const storedModule = loadStoredModule(storage, moduleId)
    if (!storedModule) {
      router.push('/learn/library')
      return
    }
    setModule(storedModule)
    const progress = storage.get<ProgressState>(StorageKeys.progress(moduleId))
    useProgressStore.getState().startModule(moduleId)
    if (progress?.stage && progress.stage.kind !== 'done') {
      useProgressStore.getState().setStage(progress.stage)
      router.push(`/learn/module/${moduleId}`)
    } else {
      router.push('/learn/overview')
    }
  }

  if (modules.length === 0) return null

  return (
    <label className="flex items-center gap-2 text-xs text-fg-secondary">
      <span>当前 Module</span>
      <select
        value={currentModuleId ?? ''}
        onChange={(event) => handleChange(event.target.value)}
        className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-fg-primary"
      >
        <option value="" disabled>
          选择题库
        </option>
        {modules.map((module) => (
          <option key={module.id} value={module.id}>
            {module.title}
          </option>
        ))}
      </select>
    </label>
  )
}
