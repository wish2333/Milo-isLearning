'use client'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export interface MigrationPromptProps {
  moduleCount: number
  totalBytes: number
  onMigrate: () => void
  onDismiss: () => void
  onViewDetail: () => void
}

export function MigrationPrompt(props: MigrationPromptProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="max-w-md rounded-lg border border-[var(--alc-border)] bg-[var(--alc-bg-elev)] p-6 space-y-4">
        <h2 className="font-[var(--font-fraunces)] text-lg font-semibold text-[var(--alc-text-primary)]">
          检测到旧版数据
        </h2>
        <p className="text-sm text-[var(--alc-text-secondary)]">
          发现 {props.moduleCount} 个 Module，共 {formatBytes(props.totalBytes)}。
          是否迁移到本地数据库？
        </p>
        <p className="text-xs text-[var(--alc-text-secondary)] opacity-70">
          迁移后旧 LocalStorage 数据保留（不会自动删除）。
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            onClick={props.onMigrate}
            className="rounded-md border border-[var(--alc-accent)] bg-[var(--alc-accent)]/10 px-4 py-2 text-sm text-[var(--alc-accent)] hover:bg-[var(--alc-accent)]/20"
          >
            立即迁移
          </button>
          <button
            type="button"
            onClick={props.onViewDetail}
            className="rounded-md border border-[var(--alc-border)] px-4 py-2 text-sm text-[var(--alc-text-secondary)] hover:bg-[var(--alc-bg-base)]"
          >
            查看详情
          </button>
          <button
            type="button"
            onClick={props.onDismiss}
            className="rounded-md px-4 py-2 text-sm text-[var(--alc-text-secondary)] opacity-70 hover:text-[var(--alc-text-secondary)]"
          >
            稍后再说
          </button>
        </div>
      </div>
    </div>
  )
}
