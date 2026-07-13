'use client'

import { useState, type ChangeEvent } from 'react'

import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { getProductionStorage } from '@/lib/persistence/client/storage'

/**
 * DataManagement -- 设置页「数据管理」区块
 *
 * 三项操作：
 *   1. 全库备份：GET /api/data/export -> 浏览器下载 BackupPackage JSON
 *   2. 全库恢复（灾难恢复）：file picker -> 校验 -> 二次确认 -> POST /api/data/restore?confirm=true
 *   3. 重新加载缓存：调用 ClientFetchStorage.loadFromServer()
 *
 * Showcase 模式：渲染 null（无 server，无 SQLite）。
 * 安全：恢复操作需二次确认 modal，确认文本输入"确认恢复"匹配才放行。
 */

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

type RestoreState =
  | { kind: 'idle' }
  | { kind: 'parsing'; fileName: string }
  | { kind: 'confirm'; fileName: string; sizeBytes: number; parsedSummary: string; file: File }
  | { kind: 'restoring'; fileName: string }
  | { kind: 'success'; fileName: string; restored: number; snapshotPath: string }
  | { kind: 'error'; fileName: string; message: string }

type ExportState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; sizeBytes: number }
  | { kind: 'error'; message: string }

type ReloadState = 'idle' | 'loading' | 'success' | 'error'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataManagement(): React.ReactNode {
  const [exportState, setExportState] = useState<ExportState>({ kind: 'idle' })
  const [restoreState, setRestoreState] = useState<RestoreState>({ kind: 'idle' })
  const [reloadState, setReloadState] = useState<ReloadState>('idle')
  const [confirmText, setConfirmText] = useState('')

  if (isShowcaseMode) return null

  // ----- Export -----

  const handleExport = async (): Promise<void> => {
    setExportState({ kind: 'loading' })
    try {
      const res = await fetch('/api/data/export')
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `alc-backup-${formatFileTimestamp(new Date())}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setExportState({ kind: 'success', sizeBytes: blob.size })
    } catch (err) {
      setExportState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ----- Restore -----

  const handleFilePick = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return

    setRestoreState({ kind: 'parsing', fileName: file.name })
    try {
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('文件超过 50 MiB 上限')
      }
      const text = await file.text()
      const preview = JSON.parse(text) as {
        version?: number
        entries?: unknown[]
        meta?: { moduleCount?: number; totalBytes?: number; appVersion?: string }
      }
      if (preview.version !== 1) {
        throw new Error(`不支持的 backup 版本：${preview.version ?? '未知'}`)
      }
      const summary =
        `版本：${preview.version} | ` +
        `条目：${preview.entries?.length ?? 0} | ` +
        `模块：${preview.meta?.moduleCount ?? 0} | ` +
        `大小：${formatBytes(preview.meta?.totalBytes ?? file.size)} | ` +
        `应用版本：${preview.meta?.appVersion ?? '未知'}`
      setRestoreState({
        kind: 'confirm',
        fileName: file.name,
        sizeBytes: file.size,
        parsedSummary: summary,
        file,
      })
      setConfirmText('')
    } catch (err) {
      setRestoreState({
        kind: 'error',
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
      })
    }
    // 清掉 input 的 value，允许用户重新选择同一文件
    e.target.value = ''
  }

  const handleConfirmRestore = async (): Promise<void> => {
    if (restoreState.kind !== 'confirm') return
    if (confirmText !== '确认恢复') return

    const { fileName, file } = restoreState
    setRestoreState({ kind: 'restoring', fileName })
    try {
      const res = await fetch('/api/data/restore?confirm=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await file.text(),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string
          detail?: string
        }
        throw new Error(
          body.error ?? `HTTP ${res.status}` + (body.detail ? `: ${body.detail}` : ''),
        )
      }
      const body = (await res.json()) as {
        restored: number
        snapshotPath: string
      }
      setRestoreState({
        kind: 'success',
        fileName,
        restored: body.restored,
        snapshotPath: body.snapshotPath,
      })
    } catch (err) {
      setRestoreState({
        kind: 'error',
        fileName,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleCancelRestore = (): void => {
    setRestoreState({ kind: 'idle' })
    setConfirmText('')
  }

  // ----- Reload -----

  const handleReload = async (): Promise<void> => {
    setReloadState('loading')
    try {
      const repo = getProductionStorage()
      await repo.loadFromServer()
      setReloadState('success')
    } catch {
      setReloadState('error')
    }
  }

  // ----- Render -----

  return (
    <section className="pt-4 border-t border-border-subtle">
      <h3 className="text-sm font-medium text-fg-primary mb-3">数据管理</h3>
      <p className="text-xs text-fg-tertiary mb-4">
        全库备份与灾难恢复。备份为明文学习数据，不含 API Key。
      </p>

      <div className="space-y-6">
        {/* 全库备份 */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wider">
            全库备份
          </h4>
          <p className="text-xs text-fg-tertiary">
            导出当前所有学习数据为 BackupPackage JSON 文件。
          </p>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportState.kind === 'loading'}
            className="text-xs text-accent-primary border border-accent-primary rounded-md px-3 py-1.5 hover:bg-accent-primary-soft disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportState.kind === 'loading' ? '正在导出...' : '下载全库备份'}
          </button>
          {exportState.kind === 'success' && (
            <p className="text-xs text-success">
              导出成功（{formatBytes(exportState.sizeBytes)}），文件已开始下载。
            </p>
          )}
          {exportState.kind === 'error' && (
            <p className="text-xs text-danger">导出失败：{exportState.message}</p>
          )}
        </div>

        {/* 全库恢复 */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wider">
            全库恢复（灾难恢复）
          </h4>
          <p className="text-xs text-fg-tertiary">
            从 BackupPackage 文件恢复。
            <strong className="text-danger">
              {' '}
              此操作会自动备份当前库并清空，然后用备份文件覆盖。
            </strong>
          </p>
          <label
            className={
              'inline-block cursor-pointer text-xs text-fg-tertiary border border-border-default rounded-md px-3 py-1.5 hover:border-accent-primary ' +
              (restoreState.kind === 'restoring' || restoreState.kind === 'parsing'
                ? 'pointer-events-none opacity-50'
                : '')
            }
          >
            选择备份文件...
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleFilePick}
              className="hidden"
            />
          </label>

          {/* 确认 modal */}
          {restoreState.kind === 'confirm' && (
            <div className="rounded-md border border-danger/40 bg-danger-soft p-3 space-y-2">
              <p className="text-xs font-medium text-fg-primary">
                确认从 {restoreState.fileName} 恢复？
              </p>
              <p className="text-xs text-fg-secondary">{restoreState.parsedSummary}</p>
              <p className="text-xs text-danger">
                当前所有数据会被覆盖。系统会自动生成快照备份供回滚。
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="输入「确认恢复」以继续"
                className="block w-full rounded border border-border-default bg-bg-base px-2 py-1 text-xs text-fg-primary placeholder:text-fg-quaternary"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmRestore}
                  disabled={confirmText !== '确认恢复'}
                  className="text-xs text-danger border border-danger rounded-md px-3 py-1 hover:bg-danger-soft disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  确认恢复
                </button>
                <button
                  type="button"
                  onClick={handleCancelRestore}
                  className="text-xs text-fg-tertiary border border-border-default rounded-md px-3 py-1 hover:bg-bg-surface"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {restoreState.kind === 'restoring' && (
            <p className="text-xs text-fg-secondary">正在恢复...（含自动备份当前库）</p>
          )}

          {restoreState.kind === 'success' && (
            <div className="space-y-1 text-xs">
              <p className="text-success">恢复成功：导入 {restoreState.restored} 条</p>
              <p className="text-fg-tertiary">自动快照：{restoreState.snapshotPath}</p>
            </div>
          )}

          {restoreState.kind === 'error' && (
            <p className="text-xs text-danger">恢复失败：{restoreState.message}</p>
          )}
        </div>

        {/* 重新加载缓存 */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-fg-secondary uppercase tracking-wider">
            重新加载缓存
          </h4>
          <p className="text-xs text-fg-tertiary">
            强制从 server 重新拉取全量数据，刷新本地缓存。用于排查数据不一致。
          </p>
          <button
            type="button"
            onClick={handleReload}
            disabled={reloadState === 'loading'}
            className="text-xs text-fg-tertiary border border-border-default rounded-md px-3 py-1.5 hover:border-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reloadState === 'loading' ? '加载中...' : '重新加载缓存'}
          </button>
          {reloadState === 'success' && <p className="text-xs text-success">缓存已重新加载</p>}
          {reloadState === 'error' && <p className="text-xs text-danger">加载失败，请重试</p>}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Exported helpers (for unit testing)
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatFileTimestamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
}
