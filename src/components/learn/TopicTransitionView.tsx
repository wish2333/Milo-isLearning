'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { getTopic } from '@/lib/persistence/topic-library'
import { loadStoredModule } from '@/lib/persistence/module-library'
import { storage } from '@/lib/persistence/client/local-storage'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useTopicSessionStore } from '@/lib/state/topic-session-store'

import type { ModuleTopicStatus } from '@/types/domain'

interface TopicTransitionViewProps {
  topicId: string
}

const STATUS_ICON: Record<ModuleTopicStatus, { icon: string; className: string }> = {
  done: { icon: '\u2713', className: 'text-success' },
  in_progress: { icon: '\u25CF', className: 'text-accent-primary' },
  pending: { icon: '\u25CB', className: 'text-fg-tertiary' },
}

export function TopicTransitionView({ topicId }: TopicTransitionViewProps) {
  const router = useRouter()
  const session = useTopicSessionStore((s) => s.session)

  useEffect(() => {
    if (!session || session.topicId !== topicId) {
      router.replace('/learn/library')
    }
  }, [session, topicId, router])

  const topic = getTopic(storage, topicId)
  if (!topic) {
    useTopicSessionStore.getState().exitSession()
    router.replace('/learn/library')
    return null
  }

  if (!session) return null

  const doneCount = Object.values(session.moduleStatus).filter((s) => s === 'done').length
  const totalCount = session.moduleIds.length
  const allDone = doneCount === totalCount
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const handleContinue = () => {
    const nextModuleId = useTopicSessionStore.getState().advanceToNextModule()
    if (!nextModuleId) return
    const moduleData = loadStoredModule(storage, nextModuleId)
    if (!moduleData) {
      useTopicSessionStore.getState().exitSession()
      router.push('/learn/library')
      return
    }
    useModuleStore.getState().setModule(moduleData)
    useProgressStore.getState().startModule(nextModuleId)
    router.push(`/learn/module/${nextModuleId}`)
  }

  const handleExit = () => {
    useTopicSessionStore.getState().exitSession()
    router.push('/learn/library')
  }

  if (allDone) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <div className="alc-card p-6 space-y-4 text-center">
          <p className="text-2xl">&#x1F389;</p>
          <h2 className="text-lg font-medium text-fg-primary">主题全部完成！</h2>
          <p className="text-fg-secondary">{topic.name}</p>
          <p className="text-sm text-fg-tertiary">
            {doneCount}/{totalCount} 模块已完成
          </p>
        </div>

        <div className="alc-card p-5 space-y-2">
          {session.moduleIds.map((moduleId) => {
            const mod = loadStoredModule(storage, moduleId)
            const status = STATUS_ICON.done
            return (
              <div key={moduleId} className="flex items-center gap-2 text-sm">
                <span className={status.className}>{status.icon}</span>
                <span className="truncate text-fg-secondary">{mod?.title ?? moduleId}</span>
              </div>
            )
          })}
        </div>

        <button type="button" onClick={handleExit} className="alc-button-primary w-full text-sm">
          返回题库
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div className="alc-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-fg-primary font-medium text-base">{topic.name}</p>
            {topic.description && <p className="alc-label mt-1 text-xs">{topic.description}</p>}
          </div>
          <span className="text-xs text-fg-tertiary shrink-0">
            {doneCount}/{totalCount} 完成
          </span>
        </div>

        {totalCount > 0 && (
          <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      <div className="alc-card p-5 space-y-1.5">
        {session.moduleIds.map((moduleId) => {
          const mod = loadStoredModule(storage, moduleId)
          const status = session.moduleStatus[moduleId] ?? 'pending'
          const icon = STATUS_ICON[status]
          return (
            <div key={moduleId} className="flex items-center gap-2 text-sm">
              <span className={icon.className}>{icon.icon}</span>
              <span
                className={`truncate ${status === 'done' ? 'text-fg-secondary' : 'text-fg-primary'}`}
              >
                {mod?.title ?? moduleId}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleContinue}
          className="alc-button-primary flex-1 text-sm"
        >
          继续学习
        </button>
        <button type="button" onClick={handleExit} className="alc-button-secondary flex-1 text-sm">
          退出主题
        </button>
      </div>
    </div>
  )
}
