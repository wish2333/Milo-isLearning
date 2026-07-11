'use client'

/**
 * ModuleLibraryList — Library 列表 UI（M7.5 Task 3, M8.1 Task 4）
 *
 * 行为：
 *   - 显示所有 StoredModuleSummary
 *   - 继续 / 重新学习 / 删除（二次确认）/ 导出 单个 module
 *   - 导入由父页面持有（ModuleImportExport）
 *   - M8.1: 提取 ModuleLibraryRow 供 TopicSection 复用
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { StoredModuleSummary } from '@/lib/persistence/module-library'
import { loadStoredModule, resetStoredModuleProgress } from '@/lib/persistence/module-library'
import { StorageKeys } from '@/lib/persistence/keys'
import { removeModule } from '@/lib/persistence/quota'
import { storage } from '@/lib/persistence/local-storage'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { hasWrongQuestions } from '@/lib/persistence/wrong-question-book'
import type { AttemptRecord, ProgressState } from '@/types/domain'

import { exportModuleToBrowserDownload } from './ModuleImportExport'

interface ModuleLibraryListProps {
  modules: StoredModuleSummary[]
  /** 列表发生变更（删除/导入/重置）时调用，父组件应刷新列表 */
  onChanged: () => void
}

function formatDate(ts: number): string {
  if (!ts) return '未开始'
  const d = new Date(ts)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

/** 根据完成状态和更新时间推导学习状态标签 */
function getStatusBadge(
  completed: boolean,
  updatedAt: number,
): { label: string; className: string } {
  if (completed) {
    return { label: '已完成', className: 'text-success bg-success-soft' }
  }
  if (updatedAt > 0) {
    return { label: '学习中', className: 'text-fg-secondary bg-bg-elevated' }
  }
  return { label: '未开始', className: 'text-fg-tertiary bg-bg-elevated' }
}

// =================================================================
// ModuleLibraryRow — 可复用的单行渲染
// =================================================================

export interface ModuleLibraryRowProps {
  module: StoredModuleSummary
  attemptsBySlot: Record<string, AttemptRecord[]>
  onOpen: (module: StoredModuleSummary) => void
  onRestart: (module: StoredModuleSummary) => void
  onDeleteRequest: (module: StoredModuleSummary) => void
  onExport: (module: StoredModuleSummary) => void
}

export function ModuleLibraryRow({
  module: m,
  attemptsBySlot,
  onOpen,
  onRestart,
  onDeleteRequest,
  onExport,
}: ModuleLibraryRowProps) {
  const router = useRouter()

  return (
    <li className="alc-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-fg-primary font-medium truncate">{m.title}</p>
          <p className="alc-label mt-0.5">
            {m.conceptCount} 概念 · {m.quizCount} 题 · {formatDate(m.updatedAt)}
          </p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded shrink-0 ${getStatusBadge(m.completed, m.updatedAt).className}`}
        >
          {getStatusBadge(m.completed, m.updatedAt).label}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => onOpen(m)}
          className="alc-button-primary text-xs px-3 py-1.5"
        >
          {m.completed ? '查看' : m.updatedAt > 0 ? '继续' : '开始学习'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/learn/history/${m.id}`)}
          className="alc-button-secondary text-xs px-3 py-1.5"
        >
          作答记录
        </button>
        <button
          type="button"
          onClick={() => onRestart(m)}
          className="alc-button-secondary text-xs px-3 py-1.5"
        >
          重新学习
        </button>
        <button
          type="button"
          onClick={() => onExport(m)}
          className="alc-button-secondary text-xs px-3 py-1.5"
        >
          导出
        </button>
        <ModuleReviewButton moduleId={m.id} attemptsBySlot={attemptsBySlot} />
        <button
          type="button"
          onClick={() => router.push(`/learn/review/${m.id}?filter=guessed`)}
          className="alc-button-secondary text-xs px-3 py-1.5"
        >
          重刷蒙对题
        </button>
        <button
          type="button"
          onClick={() => onDeleteRequest(m)}
          className="alc-button-danger text-xs px-3 py-1.5"
        >
          删除
        </button>
      </div>
    </li>
  )
}

export function ModuleLibraryList({ modules, onChanged }: ModuleLibraryListProps) {
  const router = useRouter()
  const setModule = useModuleStore((s) => s.setModule)
  const startModule = useProgressStore((s) => s.startModule)
  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // ---------- 打开 / 继续 ----------

  const handleOpen = (summary: StoredModuleSummary) => {
    const storedModule = loadStoredModule(storage, summary.id)
    if (!storedModule) {
      setToast('Module 不存在或已损坏')
      return
    }
    setModule(storedModule)
    const storedProgress = storage.get<ProgressState>(StorageKeys.progress(storedModule.id))
    const activeProgress = useProgressStore.getState()
    const hasActiveProgress =
      activeProgress.moduleId === storedModule.id && activeProgress.stage !== null
    // 若已完成或无进度 → 跳概览；否则跳学习页继续
    if (summary.completed || (!storedProgress && !hasActiveProgress)) {
      router.push('/learn/overview')
    } else {
      router.push(`/learn/module/${storedModule.id}`)
    }
  }

  // ---------- 重新学习 ----------

  const handleRestart = (summary: StoredModuleSummary) => {
    const storedModule = loadStoredModule(storage, summary.id)
    if (!storedModule) {
      setToast('Module 不存在或已损坏')
      return
    }
    resetStoredModuleProgress(storage, summary.id)
    setModule(storedModule)
    startModule(storedModule.id)
    router.push('/learn/overview')
  }

  // ---------- 删除（二次确认）----------

  const handleDeleteRequest = (summary: StoredModuleSummary) => {
    setPendingDeleteId(summary.id)
  }

  const handleDeleteConfirm = () => {
    if (!pendingDeleteId) return
    removeModule(storage, pendingDeleteId)
    // 若当前 module store 持有的就是被删除的，清空
    const currentId = useModuleStore.getState().currentModule?.id
    if (currentId === pendingDeleteId) {
      useModuleStore.getState().clear()
    }
    setPendingDeleteId(null)
    onChanged()
    setToast('已删除')
  }

  const handleDeleteCancel = () => setPendingDeleteId(null)

  // ---------- 导出 ----------

  const handleExport = (summary: StoredModuleSummary) => {
    const ok = exportModuleToBrowserDownload(summary.id)
    setToast(ok ? '已下载导出文件' : '导出失败：Module 或 source 不存在')
  }

  if (modules.length === 0) {
    return (
      <div className="alc-card p-8 text-center space-y-2">
        <p className="text-fg-secondary text-sm">题库还是空的</p>
        <p className="alc-muted text-xs">编译一个 Module 或导入 JSON 文件即可看到这里</p>
      </div>
    )
  }

  return (
    <>
      {toast && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 alc-card-elevated px-4 py-2 text-sm z-40"
          role="status"
        >
          {toast}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="alc-link ml-3 text-xs"
            aria-label="关闭提示"
          >
            关闭
          </button>
        </div>
      )}

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
          />
        ))}
      </ul>

      {/* 删除二次确认 */}
      {pendingDeleteId && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-sm w-full alc-card-elevated p-6 space-y-4">
            <h3 className="text-base font-medium text-fg-primary">确认删除这个 Module？</h3>
            <p className="text-sm text-fg-secondary">
              将删除 Module 本体、源文本、学习进度、费曼作答和导出包元数据。该操作不可撤销。
            </p>
            <p className="text-xs alc-muted">若要保留进度只看内容，请改用「查看」或「导出」。</p>
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
                onClick={handleDeleteCancel}
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

// =================================================================
// ModuleReviewButton — 条件渲染的"重刷错题"按钮
// =================================================================

function ModuleReviewButton({
  moduleId,
  attemptsBySlot,
}: {
  moduleId: string
  attemptsBySlot: Record<string, AttemptRecord[]>
}) {
  const router = useRouter()
  const [hasWrong, setHasWrong] = useState(false)

  useEffect(() => {
    const moduleData = loadStoredModule(storage, moduleId)
    if (!moduleData) return
    setHasWrong(hasWrongQuestions(moduleData, attemptsBySlot))
  }, [moduleId, attemptsBySlot])

  if (!hasWrong) return null

  return (
    <button
      type="button"
      onClick={() => router.push(`/learn/review/${moduleId}`)}
      className="alc-button-secondary text-xs px-3 py-1.5"
    >
      重刷错题
    </button>
  )
}
