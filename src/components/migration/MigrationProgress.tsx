'use client'

import type { MigrationProgress as ProgressState } from '@/lib/persistence/migration'

function getPhaseLabel(p: ProgressState): string {
  switch (p.phase) {
    case 'scan':
      return '扫描旧数据...'
    case 'snapshot':
      return p.message
    case 'session':
      return p.message
    case 'upload':
      return '上传数据...'
    case 'commit':
      return p.message
    case 'reload':
      return p.message
    case 'done':
      return '完成'
    case 'error':
      return '失败'
  }
}

function getPercent(p: ProgressState): number | null {
  if (p.phase === 'upload' && p.total > 0) {
    return Math.round((p.uploaded / p.total) * 100)
  }
  if (p.phase === 'done') return 100
  return null
}

export interface MigrationProgressProps {
  progress: ProgressState
  onCancel: () => void
}

export function MigrationProgress(props: MigrationProgressProps) {
  const { progress } = props
  const canCancel =
    progress.phase === 'snapshot' || progress.phase === 'session' || progress.phase === 'upload'

  const phaseLabel = getPhaseLabel(progress)
  const percent = getPercent(progress)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-w-md w-full rounded-lg border border-[var(--alc-border)] bg-[var(--alc-bg-elev)] p-6 space-y-4">
        <h2 className="font-[var(--font-fraunces)] text-lg font-semibold text-[var(--alc-text-primary)]">
          正在迁移...
        </h2>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-[var(--alc-text-secondary)]">
            <span>{phaseLabel}</span>
            {percent !== null && <span>{percent}%</span>}
          </div>
          <div className="h-2 rounded bg-[var(--alc-bg-base)] overflow-hidden">
            <div
              className="h-full bg-[var(--alc-accent)] transition-all"
              style={{ width: percent !== null ? `${percent}%` : '100%' }}
            />
          </div>
        </div>

        {progress.phase === 'upload' && (
          <p className="text-xs text-[var(--alc-text-secondary)]">
            已上传 {progress.uploaded} / {progress.total} 条
          </p>
        )}
        {progress.phase === 'commit' && (
          <p className="text-xs text-[var(--alc-danger,#c88080)]">
            正在提交（此步骤不可取消，请稍候）
          </p>
        )}

        {canCancel && (
          <div className="pt-2">
            <button
              type="button"
              onClick={props.onCancel}
              className="rounded-md border border-[var(--alc-border)] px-4 py-1.5 text-xs text-[var(--alc-text-secondary)] hover:bg-[var(--alc-bg-base)]"
            >
              取消迁移
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
