'use client'

/**
 * TopicCard — 主题卡片（M8.1 Task 4）
 *
 * 显示主题名称、描述、进度条、模块状态列表、操作按钮。
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import type { Topic, KnowledgeSource, Module } from '@/types/domain'
import type { StoredModuleSummary } from '@/lib/persistence/module-library'
import { loadStoredModule } from '@/lib/persistence/module-library'
import { downloadWrongQuestionBookForTopic } from '@/lib/persistence/wrong-question-book'
import { deleteTopic } from '@/lib/persistence/topic-library'
import { createModulePackage } from '@/lib/persistence/module-package'
import { createTopicPackage, downloadTopicPackage } from '@/lib/persistence/topic-package'
import { StorageKeys } from '@/lib/persistence/keys'
import { useTopicSessionStore } from '@/lib/state/topic-session-store'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { storage } from '@/lib/persistence/local-storage'

interface TopicCardProps {
  topic: Topic
  modules: StoredModuleSummary[]
  onEdit: (topic: Topic) => void
  onChanged: () => void
}

/** 模块状态标记 */
function getModuleStatusIcon(
  completed: boolean,
  updatedAt: number,
): {
  icon: string
  className: string
} {
  if (completed) return { icon: '\u2713', className: 'text-success' }
  if (updatedAt > 0) return { icon: '\u25CF', className: 'text-accent-primary' }
  return { icon: '\u25CB', className: 'text-fg-tertiary' }
}

export function TopicCard({ topic, modules, onEdit, onChanged }: TopicCardProps) {
  const router = useRouter()
  const [pendingDelete, setPendingDelete] = useState(false)
  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)

  const completedCount = modules.filter((m) => m.completed).length
  const totalCount = modules.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const handleStartTopic = () => {
    const ok = useTopicSessionStore.getState().startSession(topic.id)
    if (!ok) return
    const firstModuleId = useTopicSessionStore.getState().getCurrentModuleId()
    if (!firstModuleId) return
    const moduleData = loadStoredModule(storage, firstModuleId)
    if (!moduleData) return
    useModuleStore.getState().setModule(moduleData)
    useProgressStore.getState().startModule(firstModuleId)
    router.push(`/learn/module/${firstModuleId}`)
  }

  const handleDeleteConfirm = () => {
    deleteTopic(topic.id)
    setPendingDelete(false)
    onChanged()
  }

  const handleExportTopic = () => {
    const modulePackages: ReturnType<typeof createModulePackage>[] = []
    for (const moduleId of topic.moduleIds) {
      const moduleData = loadStoredModule(storage, moduleId)
      if (!moduleData) continue
      const source = storage.get<KnowledgeSource>(StorageKeys.source(moduleData.sourceId))
      if (!source) continue
      const quality = storage.get<unknown>(StorageKeys.qualityReport(moduleId))
      modulePackages.push(
        createModulePackage({ source, module: moduleData, qualityReport: quality }),
      )
    }
    if (modulePackages.length === 0) return
    const pkg = createTopicPackage({ topic, modulePackages })
    downloadTopicPackage(pkg)
  }

  const handleExportWrongBook = () => {
    const modulesData = topic.moduleIds
      .map((id) => loadStoredModule(storage, id))
      .filter((m): m is Module => m !== null)
    if (modulesData.length === 0) return
    downloadWrongQuestionBookForTopic(topic.name, modulesData, attemptsBySlot)
  }

  return (
    <>
      <div className="alc-card p-5 space-y-4">
        {/* 标题 + 描述 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-fg-primary font-medium text-base">{topic.name}</p>
            {topic.description && <p className="alc-label mt-1 text-xs">{topic.description}</p>}
          </div>
          <span className="text-xs text-fg-tertiary shrink-0">
            {completedCount}/{totalCount} 完成
          </span>
        </div>

        {/* 进度条 */}
        {totalCount > 0 && (
          <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* 模块状态列表 */}
        {modules.length > 0 && (
          <div className="space-y-1.5">
            {modules.map((m) => {
              const status = getModuleStatusIcon(m.completed, m.updatedAt)
              return (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className={status.className}>{status.icon}</span>
                  <span
                    className={`truncate ${m.completed ? 'text-fg-secondary' : 'text-fg-primary'}`}
                  >
                    {m.title}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={handleStartTopic}
            className="alc-button-primary text-xs px-3 py-1.5"
          >
            开始主题学习
          </button>
          <button
            type="button"
            onClick={() => router.push(`/learn/review/topic/${topic.id}?filter=wrong`)}
            className="alc-button-secondary text-xs px-3 py-1.5"
          >
            重刷错题
          </button>
          <button
            type="button"
            onClick={() => router.push(`/learn/review/topic/${topic.id}?filter=guessed`)}
            className="alc-button-secondary text-xs px-3 py-1.5"
          >
            重刷蒙对
          </button>
          <button
            type="button"
            onClick={() => onEdit(topic)}
            className="alc-button-secondary text-xs px-3 py-1.5"
          >
            编辑
          </button>
          <button
            type="button"
            onClick={handleExportTopic}
            className="alc-button-secondary text-xs px-3 py-1.5"
          >
            导出主题
          </button>
          <button
            type="button"
            onClick={handleExportWrongBook}
            className="alc-button-secondary text-xs px-3 py-1.5"
          >
            导出错题本
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(true)}
            className="alc-button-danger text-xs px-3 py-1.5"
          >
            删除
          </button>
        </div>
      </div>

      {/* 删除确认 */}
      {pendingDelete && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-sm w-full alc-card-elevated p-6 space-y-4">
            <h3 className="text-base font-medium text-fg-primary">
              确认删除主题「{topic.name}」？
            </h3>
            <p className="text-sm text-fg-secondary">
              将删除主题本身，其中的题库不会被删除，但会变为未归类状态。该操作不可撤销。
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="alc-button-danger flex-1 text-sm"
              >
                确认删除
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(false)}
                className="alc-button-secondary flex-1 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
