'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { StorageKeys } from '@/lib/persistence/shared/keys'
import { storage } from '@/lib/persistence/client/local-storage'
import {
  loadStoredModule,
  renameModule,
  type StoredModuleSummary,
} from '@/lib/persistence/module-library'
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
  const renameCurrentModule = useModuleStore((s) => s.renameCurrentModule)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [canRename, setCanRename] = useState(false)

  useEffect(() => {
    if (!currentModuleId) {
      setCanRename(false)
      return
    }
    const storedModule = loadStoredModule(storage, currentModuleId)
    setCanRename(storedModule?.origin !== 'showcase')
  }, [currentModuleId])

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

  const handleRenameStart = () => {
    const storedModule = loadStoredModule(storage, currentModuleId ?? '')
    setEditValue(storedModule?.title ?? '')
    setEditing(true)
  }

  const handleRenameCommit = () => {
    const trimmed = editValue.trim()
    if (trimmed.length > 0 && trimmed.length <= 100 && currentModuleId) {
      const storedModule = loadStoredModule(storage, currentModuleId)
      if (storedModule && storedModule.origin !== 'showcase') {
        try {
          renameModule(storage, currentModuleId, trimmed)
          renameCurrentModule(trimmed)
        } catch {
          // 静默处理
        }
      }
    }
    setEditing(false)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRenameCommit()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs text-fg-secondary">
      <label className="flex items-center gap-2">
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
      {editing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleRenameCommit}
          onKeyDown={handleRenameKeyDown}
          maxLength={100}
          className="w-32 rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-fg-primary text-xs"
          autoFocus
          aria-label="输入新标题"
        />
      ) : (
        canRename &&
        currentModuleId && (
          <button
            type="button"
            onClick={handleRenameStart}
            className="alc-button-secondary text-xs px-2 py-1"
            aria-label="重命名当前模块"
          >
            重命名
          </button>
        )
      )}
    </div>
  )
}
