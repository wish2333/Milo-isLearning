'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

import { getTopic } from '@/lib/persistence/topic-library'
import { loadStoredModule } from '@/lib/persistence/module-library'
import { storage } from '@/lib/persistence/client/local-storage'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { enterModule } from '@/lib/runtime/enter-module'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useTopicSessionStore } from '@/lib/state/topic-session-store'
import { computeTopicMastery } from '@/lib/runtime/topic-mastery'
import { computeModuleProgress } from '@/lib/runtime/module-progress'
import { ConfirmInline } from '@/components/common/ConfirmInline'

import type { FeynmanAttempt, Module, ModuleTopicStatus, ProgressState } from '@/types/domain'

interface TopicTransitionViewProps {
  topicId: string
}

const STATUS_ICON: Record<ModuleTopicStatus, { icon: string; className: string }> = {
  done: { icon: '\u2713', className: 'text-success' },
  in_progress: { icon: '\u25CF', className: 'text-accent-primary' },
  pending: { icon: '\u25CB', className: 'text-fg-tertiary' },
  skipped: { icon: '\u25CC', className: 'text-fg-tertiary' },
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

  // computeTopicMastery must be before early returns (React hooks rule)
  const topicMastery = useMemo(() => {
    if (!topic) return null
    const modules: Module[] = topic.moduleIds
      .map((id) => loadStoredModule(storage, id))
      .filter((m): m is Module => m !== null)
    if (modules.length === 0) return null

    const attemptsBySlot = useAttemptsStore.getState().attemptsBySlot
    const feynmanAttempts: Record<string, FeynmanAttempt> = {}
    for (const mod of modules) {
      const feynman = storage.get<FeynmanAttempt>(StorageKeys.feynman(mod.id))
      if (feynman) {
        feynmanAttempts[mod.id] = feynman
      }
    }

    return computeTopicMastery(topic, modules, attemptsBySlot, feynmanAttempts)
  }, [topic])

  const moduleMap = useMemo(() => {
    const map: Record<string, Module> = {}
    for (const moduleId of session?.moduleIds ?? []) {
      const mod = loadStoredModule(storage, moduleId)
      if (mod) map[moduleId] = mod
    }
    return map
  }, [session?.moduleIds])

  const progressMap = useMemo(() => {
    const map: Record<string, ProgressState | null> = {}
    for (const moduleId of session?.moduleIds ?? []) {
      map[moduleId] = storage.get<ProgressState>(StorageKeys.progress(moduleId))
    }
    return map
  }, [session?.moduleIds])

  if (!topic) {
    useTopicSessionStore.getState().exitSession()
    router.replace('/learn/library')
    return null
  }

  if (!session) return null

  const statuses = Object.values(session.moduleStatus)
  const doneCount = statuses.filter((s) => s === 'done').length
  const skippedCount = statuses.filter((s) => s === 'skipped').length
  const inProgressCount = statuses.filter((s) => s === 'in_progress').length
  const totalCount = session.moduleIds.length
  const allDone = doneCount + skippedCount === totalCount
  const progressPercent =
    totalCount > 0 ? Math.round(((doneCount + skippedCount) / totalCount) * 100) : 0

  const handleContinue = () => {
    const nextModuleId = useTopicSessionStore.getState().advanceToNextModule()
    if (!nextModuleId) return
    const entered = enterModule({ moduleId: nextModuleId, allowResume: true })
    if (!entered) {
      useTopicSessionStore.getState().exitSession()
      router.push('/learn/library')
      return
    }
    router.push(`/learn/module/${nextModuleId}`)
  }

  const handleSkip = () => {
    const nextModuleId = useTopicSessionStore.getState().skipCurrentModule()
    if (!nextModuleId) return
    const entered = enterModule({ moduleId: nextModuleId, allowResume: true })
    if (!entered) {
      useTopicSessionStore.getState().exitSession()
      router.push('/learn/library')
      return
    }
    router.push(`/learn/module/${nextModuleId}`)
  }

  const handleReenter = (moduleId: string) => {
    const entered = enterModule({ moduleId, allowResume: true })
    if (!entered) return
    useTopicSessionStore.getState().reenterModule(moduleId)
    router.push(`/learn/module/${moduleId}`)
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
            {doneCount}/{totalCount} 已完成{skippedCount > 0 ? ` · ${skippedCount} 已跳过` : ''}
          </p>
          {topicMastery && topicMastery.totalQuizzes > 0 && (
            <div className="mt-3">
              <p className="alc-label text-xs">整体掌握度</p>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success rounded-full transition-all"
                    style={{ width: `${topicMastery.aggregateMastery}%` }}
                  />
                </div>
                <span className="text-xs text-fg-secondary shrink-0">
                  {topicMastery.aggregateMastery}%
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-tertiary">
                {topicMastery.completedModules}/{topicMastery.moduleMasteries.length} 模块完成度
                100%
              </p>
            </div>
          )}
        </div>

        <div className="alc-card p-5 space-y-2">
          {session.moduleIds.map((moduleId) => {
            const mod = moduleMap[moduleId]
            const info = mod ? computeModuleProgress(mod, progressMap[moduleId] ?? null) : null
            return (
              <div key={moduleId} className="flex items-center gap-2 text-sm">
                <span className="text-success">{'\u2713'}</span>
                <span className="flex-1 truncate text-fg-secondary">{mod?.title ?? moduleId}</span>
                <span className="text-xs text-[var(--success)] shrink-0">
                  {info?.label ?? '已完成'}
                </span>
                {mod && (
                  <div className="w-16 h-1 rounded-full bg-[var(--bg-elevated)] shrink-0">
                    <div
                      className="h-full rounded-full transition-[width] duration-300 ease-out"
                      style={{
                        width: `${info?.conceptPercent ?? 100}%`,
                        backgroundColor: 'var(--success)',
                      }}
                    />
                  </div>
                )}
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
            {doneCount === 0 && inProgressCount === 0
              ? '未开始'
              : `${doneCount}/${totalCount} 已完成`}
            {inProgressCount > 0 && ` · ${inProgressCount} 进行中`}
            {skippedCount > 0 && ` · ${skippedCount} 已跳过`}
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
        {topicMastery && topicMastery.totalQuizzes > 0 && (
          <div>
            <p className="alc-label text-xs">整体掌握度</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-success rounded-full transition-all"
                  style={{ width: `${topicMastery.aggregateMastery}%` }}
                />
              </div>
              <span className="text-xs text-fg-secondary shrink-0">
                {topicMastery.aggregateMastery}%
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="alc-card p-5 space-y-1.5">
        {session.moduleIds.map((moduleId) => {
          const mod = moduleMap[moduleId]
          const status = session.moduleStatus[moduleId] ?? 'pending'
          const icon = STATUS_ICON[status]
          const info = mod ? computeModuleProgress(mod, progressMap[moduleId] ?? null) : null
          const isSkipped = status === 'skipped'

          if (isSkipped) {
            return (
              <button
                key={moduleId}
                type="button"
                onClick={() => handleReenter(moduleId)}
                className="flex items-center gap-2 text-sm w-full text-left hover:bg-bg-elevated rounded px-1 py-0.5 transition-colors group"
              >
                <span className={icon.className}>{icon.icon}</span>
                <span className="flex-1 truncate text-fg-tertiary group-hover:text-fg-secondary">
                  {mod?.title ?? moduleId}
                </span>
                <div className="w-16 h-1 rounded-full bg-[var(--bg-elevated)] shrink-0">
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: '0%', backgroundColor: 'var(--fg-tertiary)' }}
                  />
                </div>
                <span className="text-xs text-fg-quaternary shrink-0">已跳过</span>
                <span className="text-xs text-fg-quaternary group-hover:text-fg-tertiary shrink-0">
                  重新进入
                </span>
              </button>
            )
          }

          return (
            <div key={moduleId} className="flex items-center gap-2 text-sm">
              <span className={icon.className}>{icon.icon}</span>
              <span
                className={`flex-1 truncate ${status === 'done' ? 'text-fg-secondary' : 'text-fg-primary'}`}
              >
                {mod?.title ?? moduleId}
              </span>
              <span
                className={
                  status === 'done'
                    ? 'text-xs text-[var(--success)] shrink-0'
                    : status === 'in_progress'
                      ? 'text-xs text-[var(--accent-primary)] shrink-0'
                      : 'text-xs text-[var(--fg-tertiary)] shrink-0'
                }
              >
                {info?.label ?? '未开始'}
              </span>
              {mod && (
                <div className="w-16 h-1 rounded-full bg-[var(--bg-elevated)] shrink-0">
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{
                      width: `${info?.conceptPercent ?? 0}%`,
                      backgroundColor:
                        status === 'done'
                          ? 'var(--success)'
                          : status === 'in_progress'
                            ? 'var(--accent-primary)'
                            : 'transparent',
                    }}
                  />
                </div>
              )}
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
        <ConfirmInline
          trigger="跳过此题库"
          confirmLabel="确认跳过？可稍后回来"
          onConfirm={handleSkip}
          triggerClassName="alc-button-secondary flex-1 text-sm"
        />
        <button type="button" onClick={handleExit} className="alc-button-secondary flex-1 text-sm">
          退出主题
        </button>
      </div>
    </div>
  )
}
