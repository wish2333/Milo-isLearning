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
import { enterModule } from '@/lib/runtime/enter-module'
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
  onRename: (moduleId: string, newTitle: string) => void
}

export function ModuleLibraryRow({
  module: m,
  attemptsBySlot,
  onOpen,
  onRestart,
  onDeleteRequest,
  onExport,
  onRename,
}: ModuleLibraryRowProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(m.title)

  const handleRenameStart = () => {
    setEditValue(m.title)
    setEditing(true)
  }

  const handleRenameCommit = () => {
    const trimmed = editValue.trim()
    if (trimmed.length > 0 && trimmed.length <= 100 && trimmed !== m.title) {
      onRename(m.id, trimmed)
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
    <li className="alc-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleRenameCommit}
              onKeyDown={handleRenameKeyDown}
              maxLength={100}
              className="w-full rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-fg-primary text-sm"
              autoFocus
              aria-label="输入新标题"
            />
          ) : (
            <p className="text-fg-primary font-medium truncate">{m.title}</p>
          )}
          <p className="alc-label mt-0.5">
            {m.conceptCount} 概念 · {m.quizCount} 题 · {formatDate(m.updatedAt)}
          </p>
          {m.progressInfo && (
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-xs mb-1">
                <span
                  className={
                    m.progressInfo.done
                      ? 'text-[var(--success)]'
                      : m.progressInfo.started
                        ? 'text-[var(--accent-primary)]'
                        : 'text-[var(--fg-tertiary)]'
                  }
                >
                  {m.progressInfo.positionLabel
                    ? `${m.progressInfo.label} · ${m.progressInfo.positionLabel}`
                    : m.progressInfo.label}
                </span>
                <span className="text-[var(--fg-tertiary)] tabular-nums">
                  {m.progressInfo.conceptPercent}%
                </span>
              </div>
              <div className="w-full h-1 rounded-full bg-[var(--bg-elevated)]">
                <div
                  className="h-full rounded-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${m.progressInfo.conceptPercent}%`,
                    backgroundColor: m.progressInfo.done
                      ? 'var(--success)'
                      : m.progressInfo.started
                        ? 'var(--accent-primary)'
                        : 'transparent',
                  }}
                />
              </div>
            </div>
          )}
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
          aria-label={`重新学习: ${m.title}`}
          className="alc-button-secondary text-xs px-3 py-1.5"
        >
          重新学习
        </button>
        <button
          type="button"
          onClick={() => onExport(m)}
          aria-label={`导出: ${m.title}`}
          className="alc-button-secondary text-xs px-3 py-1.5"
        >
          导出
        </button>
        <ModuleReviewButton moduleId={m.id} attemptsBySlot={attemptsBySlot} />
        <button
          type="button"
          onClick={() => router.push(`/learn/review/${m.id}?filter=guessed`)}
          aria-label={`重刷蒙对题: ${m.title}`}
          className="alc-button-secondary text-xs px-3 py-1.5"
        >
          重刷蒙对题
        </button>
        <button
          type="button"
          onClick={() => onDeleteRequest(m)}
          aria-label={`删除: ${m.title}`}
          className="alc-button-danger text-xs px-3 py-1.5"
        >
          删除
        </button>
        <ModuleRenameButton module={m} onStartRename={handleRenameStart} />
      </div>
    </li>
  )
}

export function ModuleLibraryList({ modules, onChanged }: ModuleLibraryListProps) {
  const router = useRouter()
  const setModule = useModuleStore((s) => s.setModule)
  const startModule = useProgressStore((s) => s.startModule)
  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)
  const repository = getStorage()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // ---------- 打开 / 继续 ----------

  const handleOpen = (summary: StoredModuleSummary) => {
    const storedModule = loadStoredModule(repository, summary.id)
    if (!storedModule) {
      setToast('Module 不存在或已损坏')
      return
    }
    const storedProgress = repository.get<ProgressState>(StorageKeys.progress(storedModule.id))
    const activeProgress = useProgressStore.getState()
    const hasActiveProgress =
      activeProgress.moduleId === storedModule.id && activeProgress.stage !== null
    // 若已完成或无进度 → 跳概览；否则经 enterModule 恢复进度后跳学习页
    if (summary.completed || (!storedProgress && !hasActiveProgress)) {
      setModule(storedModule)
      router.push('/learn/overview')
    } else {
      enterModule({ moduleId: storedModule.id, allowResume: true })
      router.push(`/learn/module/${storedModule.id}`)
    }
  }

  // ---------- 重新学习 ----------

  const handleRestart = (summary: StoredModuleSummary) => {
    const storedModule = loadStoredModule(repository, summary.id)
    if (!storedModule) {
      setToast('Module 不存在或已损坏')
      return
    }
    resetStoredModuleProgress(repository, summary.id)
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
    removeModule(repository, pendingDeleteId)
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

  // ---------- 重命名 ----------

  const handleRename = (moduleId: string, newTitle: string) => {
    const storedModule = loadStoredModule(repository, moduleId)
    if (!storedModule) {
      setToast('Module 不存在或已损坏')
      return
    }
    if (storedModule.origin === 'showcase') {
      setToast('展示模块不可重命名')
      return
    }
    try {
      renameModule(repository, moduleId, newTitle)
      // 若当前 module store 持有的就是被重命名的，同步更新内存状态
      const current = useModuleStore.getState().currentModule
      if (current && current.id === moduleId) {
        useModuleStore.getState().renameCurrentModule(newTitle)
      }
      onChanged()
    } catch {
      setToast('重命名失败')
    }
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
            onRename={handleRename}
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
                aria-label="确认删除模块"
              >
                确认删除
              </button>
              <button
                type="button"
                onClick={handleDeleteCancel}
                className="alc-button-secondary flex-1 text-sm"
                aria-label="取消删除"
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
// ModuleRenameButton -- "重命名" 按钮（展示模块 disabled）
// =================================================================

function ModuleRenameButton({
  module,
  onStartRename,
}: {
  module: StoredModuleSummary
  onStartRename: () => void
}) {
  const [isShowcase, setIsShowcase] = useState(false)

  useEffect(() => {
    const moduleData = loadStoredModule(getStorage(), module.id)
    setIsShowcase(moduleData?.origin === 'showcase')
  }, [module.id])

  if (isShowcase) {
    return (
      <button
        type="button"
        disabled
        className="alc-button-secondary text-xs px-3 py-1.5 opacity-40 cursor-not-allowed"
        aria-label="展示模块不可重命名"
      >
        重命名
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onStartRename}
      className="alc-button-secondary text-xs px-3 py-1.5"
      aria-label="重命名此模块"
    >
      重命名
    </button>
  )
}

// =================================================================
// ModuleReviewButton -- 条件渲染的"重刷错题"按钮
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
    const moduleData = loadStoredModule(getStorage(), moduleId)
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
