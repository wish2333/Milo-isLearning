'use client'

import { useState } from 'react'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export interface MigrationDetailProps {
  moduleCount: number
  totalBytes: number
  moduleIds: string[]
  showcaseModuleCount: number
  onStart: (args: { includeShowcase: boolean }) => void
  onCancel: () => void
}

export function MigrationDetail(props: MigrationDetailProps) {
  const [includeShowcase, setIncludeShowcase] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-w-lg rounded-lg border border-[var(--alc-border)] bg-[var(--alc-bg-elev)] p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-[var(--font-fraunces)] text-lg font-semibold text-[var(--alc-text-primary)]">
          迁移详情
        </h2>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-[var(--alc-text-secondary)]">Module 数量</dt>
          <dd className="text-[var(--alc-text-primary)]">{props.moduleCount}</dd>
          <dt className="text-[var(--alc-text-secondary)]">数据大小</dt>
          <dd className="text-[var(--alc-text-primary)]">{formatBytes(props.totalBytes)}</dd>
          {props.showcaseModuleCount > 0 && (
            <>
              <dt className="text-[var(--alc-text-secondary)]">示例 Module</dt>
              <dd className="text-[var(--alc-text-primary)]">{props.showcaseModuleCount}</dd>
            </>
          )}
        </dl>

        {props.showcaseModuleCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-[var(--alc-text-secondary)]">
            <input
              type="checkbox"
              checked={includeShowcase}
              onChange={(e) => setIncludeShowcase(e.target.checked)}
            />
            包含示例 Module（默认排除）
          </label>
        )}

        <div className="rounded-md border border-[var(--alc-accent)]/30 bg-[var(--alc-accent)]/5 p-3 text-xs text-[var(--alc-text-secondary)]">
          <p>
            <strong>迁移前会自动备份：</strong>系统会上传 LS 来源快照到服务器（data/backup/）， 并在
            commit 前生成 SQLite 一致性快照。失败可回滚。
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => props.onStart({ includeShowcase })}
            className="rounded-md border border-[var(--alc-accent)] bg-[var(--alc-accent)]/10 px-4 py-2 text-sm text-[var(--alc-accent)] hover:bg-[var(--alc-accent)]/20"
          >
            开始迁移
          </button>
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-md border border-[var(--alc-border)] px-4 py-2 text-sm text-[var(--alc-text-secondary)] hover:bg-[var(--alc-bg-base)]"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
