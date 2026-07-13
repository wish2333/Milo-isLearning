'use client'

export interface MigrationResultProps {
  committed: number
  skipped: number
  durationMs: number
  error: string | null
  onClose: () => void
}

export function MigrationResult(props: MigrationResultProps) {
  const success = props.error === null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-w-md rounded-lg border border-[var(--alc-border)] bg-[var(--alc-bg-elev)] p-6 space-y-4">
        <h2
          className={`font-[var(--font-fraunces)] text-lg font-semibold ${
            success ? 'text-[var(--alc-success,#7fa88c)]' : 'text-[var(--alc-danger,#c88080)]'
          }`}
        >
          {success ? '迁移成功' : '迁移失败'}
        </h2>

        {success ? (
          <div className="space-y-2 text-sm">
            <p>
              成功迁移 <strong className="text-[var(--alc-text-primary)]">{props.committed}</strong>{' '}
              条数据
            </p>
            {props.skipped > 0 && (
              <p className="text-xs text-[var(--alc-text-secondary)]">
                跳过 {props.skipped} 条（kv 表中已存在的冲突 key）
              </p>
            )}
            <p className="text-xs text-[var(--alc-text-secondary)]">
              耗时 {(props.durationMs / 1000).toFixed(1)} 秒
            </p>
            <p className="text-xs text-[var(--alc-text-secondary)] opacity-70">
              旧 LocalStorage 数据保留，可手动清空。
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-[var(--alc-danger,#c88080)]">错误：{props.error}</p>
            <p className="text-xs text-[var(--alc-text-secondary)]">
              已自动取消 migration session。SQLite 数据未受影响，可重试。
            </p>
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md border border-[var(--alc-accent)] bg-[var(--alc-accent)]/10 px-4 py-2 text-sm text-[var(--alc-accent)] hover:bg-[var(--alc-accent)]/20"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
