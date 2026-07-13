'use client'

import { useStorageStats } from '@/lib/hooks/useStorageStats'
import { isShowcaseMode } from '@/lib/runtime/app-mode'

/**
 * StorageStatsSection -- 设置页中的 production-only 统计区
 *
 * 评审 3.2.7 定案：显示 SQLite 库条目数、磁盘占用、schema 版本。
 * Showcase 模式不渲染。
 */
export function StorageStatsSection() {
  const { stats, loading, error } = useStorageStats()

  if (isShowcaseMode) return null
  if (loading) return <p className="text-sm text-fg-tertiary">加载中...</p>
  if (error) return <p className="text-sm text-danger">统计失败：{error}</p>
  if (!stats) return null

  if (!stats.enabled) {
    return (
      <p className="text-sm text-warning">
        本地数据库未启用（NEXT_PUBLIC_APP_MODE=production AND ALC_STORAGE_BACKEND=sqlite）
      </p>
    )
  }

  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <dt className="text-fg-secondary">数据条目</dt>
      <dd className="text-fg-primary">{stats.totalEntries}</dd>
      <dt className="text-fg-secondary">磁盘占用</dt>
      <dd className="text-fg-primary">{formatBytes(stats.totalBytes)}</dd>
      <dt className="text-fg-secondary">Schema 版本</dt>
      <dd className="text-fg-primary">{stats.schemaVersion}</dd>
    </dl>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
