'use client'

/**
 * 题库页 — Module Library（M7.5 Task 3 → M8.1 Task 4）
 *
 * M8.1 改造：
 *   - 从扁平列表变为分组视图：主题区域 + 未归类区域
 *   - 支持创建/编辑/删除主题
 *   - 主题刷题入口
 */

import { useCallback, useEffect, useState } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { useRuntimeMode } from '@/lib/state/runtime-mode-store'
import { storage } from '@/lib/persistence/client/local-storage'
import { listStoredModules } from '@/lib/persistence/module-library'
import type { StoredModuleSummary } from '@/lib/persistence/module-library'
import { getStorageCapacitySummary, type CapacitySummary } from '@/lib/persistence/quota'
import type { CompileQualityReport } from '@/lib/compiler/quality/quality-report'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { detectOrphans, cleanupOrphans, type OrphanReport } from '@/lib/persistence/orphan-cleanup'
import {
  listTopics,
  createTopic,
  updateTopic,
  reorderModulesInTopic,
} from '@/lib/persistence/topic-library'
import type { Topic } from '@/types/domain'

import { ModuleImportExport } from '@/components/library/ModuleImportExport'
import { QualitySummary } from '@/components/library/QualitySummary'
import { TopicSection } from '@/components/library/TopicSection'
import { TopicCreator } from '@/components/library/TopicCreator'
import { UngroupedSection } from '@/components/library/UngroupedSection'
import { IgnoredQuizSection } from '@/components/library/IgnoredQuizSection'

function getTopicModules(topic: Topic, allModules: StoredModuleSummary[]): StoredModuleSummary[] {
  return topic.moduleIds
    .map((id) => allModules.find((m) => m.id === id))
    .filter((m): m is StoredModuleSummary => m !== undefined)
}

export default function LibraryPage() {
  const hydrated = useHydrated()

  const [allModules, setAllModules] = useState<StoredModuleSummary[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [capacity, setCapacity] = useState<CapacitySummary | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [activeQualityFor, setActiveQualityFor] = useState<string | null>(null)

  // 主题创建/编辑模态
  const [showCreator, setShowCreator] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)

  // 孤儿引用检测（progress-store 指向不存在的 module）
  const [orphanReport, setOrphanReport] = useState<OrphanReport | null>(null)

  const refresh = useCallback(() => {
    const studioMode = useRuntimeMode.getState().studioMode
    const effectiveShowcase = isShowcaseMode && !studioMode
    setAllModules(listStoredModules(storage))
    setTopics(
      listTopics(storage).filter((t) =>
        effectiveShowcase ? t.origin === 'showcase' : t.origin !== 'showcase',
      ),
    )
    setCapacity(getStorageCapacitySummary(storage, studioMode))
  }, [])

  useEffect(() => {
    if (!hydrated) return
    refresh()
    // 检测孤儿引用（迁移或删除导致的悬空 moduleId）
    const report = detectOrphans(storage)
    if (report.orphanProgressModuleIds.length > 0) {
      setOrphanReport(report)
    }
  }, [hydrated, refresh])

  // ---------- 计算属性 ----------

  const topicModuleIds = new Set(topics.flatMap((t) => t.moduleIds))
  const ungroupedModules = allModules.filter((m) => !topicModuleIds.has(m.id))

  // ---------- handlers ----------

  const handleImported = () => {
    refresh()
    setToast('导入成功，可立即开始学习')
  }

  const handleTopicImported = () => {
    refresh()
    setToast('主题导入成功')
  }

  const handleError = (message: string) => {
    setToast(message)
  }

  const handleViewQuality = (moduleId: string) => {
    setActiveQualityFor((cur) => (cur === moduleId ? null : moduleId))
  }

  const handleSaveTopic = (data: { name: string; description?: string; moduleIds: string[] }) => {
    if (editingTopic) {
      updateTopic(storage, editingTopic.id, { name: data.name, description: data.description })
      reorderModulesInTopic(storage, editingTopic.id, data.moduleIds)
    } else {
      createTopic(storage, data.name, data.description, data.moduleIds)
    }
    setShowCreator(false)
    setEditingTopic(null)
    refresh()
  }

  const handleEditTopic = (topic: Topic) => {
    setEditingTopic(topic)
    setShowCreator(true)
  }

  const handleCreatorCancel = () => {
    setShowCreator(false)
    setEditingTopic(null)
  }

  const handleCreateClick = () => {
    setEditingTopic(null)
    setShowCreator(true)
  }

  const activeQualityReport =
    activeQualityFor !== null
      ? storage.get<CompileQualityReport>(StorageKeys.qualityReport(activeQualityFor))
      : null
  const activeQualityModule =
    activeQualityFor !== null ? allModules.find((m) => m.id === activeQualityFor) : null

  // ---------- render ----------

  if (!hydrated) return null

  return (
    <main className="alc-page">
      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
        {/* 导入区 */}
        <div className="alc-card p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-fg-primary">从 JSON 文件导入</p>
            <p className="alc-label mt-0.5">
              选择 .alc-module.json 文件，无需重新调用 LLM 即可学习
            </p>
          </div>
          <ModuleImportExport
            onImported={handleImported}
            onTopicImported={handleTopicImported}
            onError={handleError}
          />
        </div>

        {toast && (
          <div className="alc-card-elevated px-4 py-2 text-sm" role="status" aria-live="polite">
            <div className="flex items-center justify-between">
              <span className="text-fg-primary">{toast}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="alc-link text-xs ml-3"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        {capacity?.nearLimit && (
          <div className="alc-card border-warning/40 bg-warning-soft px-4 py-3 text-sm">
            <p className="text-fg-primary">
              本地题库接近上限（{capacity.moduleCount}
              {capacity.maxModules !== null ? `/${capacity.maxModules}` : ''}）。
            </p>
            <p className="mt-1 text-xs text-fg-secondary">
              你可以导出旧题库后再删除；系统不会在当前学习中静默删除正在使用的题库。
            </p>
          </div>
        )}

        {orphanReport && (
          <div className="alc-card border-warning/40 bg-warning-soft px-4 py-3 text-sm">
            <p className="text-fg-primary">
              检测到 {orphanReport.orphanProgressModuleIds.length} 个无效学习引用。
            </p>
            <p className="mt-1 text-xs text-fg-secondary">
              这些引用指向不存在的题库（可能因迁移或删除导致）。清理后将回到题库列表。
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  cleanupOrphans(storage, orphanReport)
                  setOrphanReport(null)
                  window.location.reload()
                }}
                className="alc-button-primary text-xs px-3 py-1"
              >
                清理引用
              </button>
              <button
                type="button"
                onClick={() => setOrphanReport(null)}
                className="alc-button-secondary text-xs px-3 py-1"
              >
                稍后处理
              </button>
            </div>
          </div>
        )}

        {/* 创建主题按钮 */}
        <div className="flex items-center justify-between">
          <p className="alc-label uppercase tracking-wider">
            已保存的 Module（{allModules.length}）
          </p>
          <button
            type="button"
            onClick={handleCreateClick}
            className="alc-button-primary text-xs px-3 py-1.5"
          >
            + 创建主题
          </button>
        </div>

        {/* 主题区域 */}
        {topics.map((t) => (
          <TopicSection
            key={t.id}
            topic={t}
            modules={getTopicModules(t, allModules)}
            onEdit={handleEditTopic}
            onChanged={refresh}
          />
        ))}

        {/* 分隔线 */}
        {topics.length > 0 && ungroupedModules.length > 0 && (
          <div className="border-t border-border-subtle" />
        )}

        {/* 未归类题库 */}
        <UngroupedSection modules={ungroupedModules} onChanged={refresh} />

        {/* 质量查看 */}
        {allModules.length > 0 && (
          <div className="pt-2 space-y-2">
            <p className="alc-label">查看任意 Module 的编译质量</p>
            <div className="flex flex-wrap gap-2">
              {allModules.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleViewQuality(m.id)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    activeQualityFor === m.id
                      ? 'border-accent-primary bg-accent-primary-soft text-fg-primary'
                      : 'border-border-subtle bg-bg-surface text-fg-secondary hover:bg-bg-elevated'
                  }`}
                >
                  {m.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeQualityFor && activeQualityReport && activeQualityModule && (
          <div className="pt-2">
            <p className="alc-label mb-2">{activeQualityModule.title} · 编译质量</p>
            <QualitySummary report={activeQualityReport} />
          </div>
        )}

        {activeQualityFor && !activeQualityReport && (
          <p className="alc-muted text-xs">
            该 Module 没有保存质量报告（可能是 M7.5 之前编译的旧数据）。
          </p>
        )}

        {/* 已忽略题目 */}
        <IgnoredQuizSection />

        {/* 主题创建/编辑模态 */}
        {showCreator && (
          <TopicCreator
            mode={editingTopic ? 'edit' : 'create'}
            topic={editingTopic ?? undefined}
            modules={allModules}
            onSave={handleSaveTopic}
            onCancel={handleCreatorCancel}
          />
        )}
      </div>
    </main>
  )
}
