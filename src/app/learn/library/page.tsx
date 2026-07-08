'use client'

/**
 * 题库页 — Module Library（M7.5 Task 3）
 *
 * 功能：
 *   - 等 hydration 后从 repository 读 StoredModuleSummary 列表
 *   - 列表为空时显示空态
 *   - 列表渲染交给 ModuleLibraryList（含 open/restart/delete/export）
 *   - 顶部挂 ModuleImportExport 用于导入 JSON
 *   - 提供返回导入页（编译新 Module）的入口
 *
 * 不调用 /api/compile：导入 JSON 即立即学习（M7.5 §Global Constraints）。
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { storage } from '@/lib/persistence/local-storage'
import { listStoredModules } from '@/lib/persistence/module-library'
import type { StoredModuleSummary } from '@/lib/persistence/module-library'
import type { CompileQualityReport } from '@/lib/compiler/quality/quality-report'
import { StorageKeys } from '@/lib/persistence/keys'

import { ModuleImportExport } from '@/components/library/ModuleImportExport'
import { ModuleLibraryList } from '@/components/library/ModuleLibraryList'
import { QualitySummary } from '@/components/library/QualitySummary'

export default function LibraryPage() {
  const router = useRouter()
  const hydrated = useHydrated()

  const [modules, setModules] = useState<StoredModuleSummary[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [activeQualityFor, setActiveQualityFor] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setModules(listStoredModules(storage))
  }, [])

  useEffect(() => {
    if (!hydrated) return
    refresh()
  }, [hydrated, refresh])

  // ---------- handlers ----------

  const handleImported = () => {
    refresh()
    setToast('导入成功，可立即开始学习')
  }

  const handleError = (message: string) => {
    setToast(message)
  }

  const handleViewQuality = (moduleId: string) => {
    setActiveQualityFor((cur) => (cur === moduleId ? null : moduleId))
  }

  const activeQualityReport =
    activeQualityFor !== null
      ? storage.get<CompileQualityReport>(StorageKeys.qualityReport(activeQualityFor))
      : null
  const activeQualityModule =
    activeQualityFor !== null ? modules.find((m) => m.id === activeQualityFor) : null

  // ---------- render ----------

  if (!hydrated) return null

  return (
    <main className="alc-page">
      <header className="border-b border-border-subtle px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-medium text-fg-primary">我的题库</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/learn/import')}
              className="alc-link text-sm"
            >
              编译新 Module
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="alc-muted text-sm hover:text-fg-secondary"
            >
              返回首页
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
        {/* 导入区 */}
        <div className="alc-card p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-fg-primary">从 JSON 文件导入</p>
            <p className="alc-label mt-0.5">
              选择 .alc-module.json 文件，无需重新调用 LLM 即可学习
            </p>
          </div>
          <ModuleImportExport onImported={handleImported} onError={handleError} />
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

        {/* 列表 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="alc-label uppercase tracking-wider">
              已保存的 Module（{modules.length}）
            </p>
            {modules.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveQualityFor(modules[0]?.id ?? null)}
                className="alc-link text-xs"
              >
                查看首项质量摘要
              </button>
            )}
          </div>

          <ModuleLibraryList modules={modules} onChanged={refresh} />

          {/* per-module quality viewer (轻量展开) */}
          {modules.length > 0 && (
            <div className="pt-2 space-y-2">
              <p className="alc-label">查看任意 Module 的编译质量</p>
              <div className="flex flex-wrap gap-2">
                {modules.map((m) => (
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
        </section>
      </div>
    </main>
  )
}
