'use client'

/**
 * StorageError -- production 模式启动失败的全屏错误页
 *
 * 评审 3.2.2 D4 定案：显示错误页 + 重试按钮，不静默继续。
 * Showcase 模式永不渲染此组件。
 */

interface StorageErrorProps {
  message: string
  onRetry: () => void
}

export function StorageError({ message, onRetry }: StorageErrorProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base px-4"
      role="alert"
    >
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-display text-xl font-semibold text-fg-primary">无法加载本地学习数据</h1>
        <p className="text-sm text-fg-secondary">
          请确认本地数据库已启用，或检查 Next.js dev server 是否正在运行。
        </p>
        <details className="text-left text-xs text-fg-tertiary">
          <summary className="cursor-pointer select-none">技术详情</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all rounded border border-border bg-bg-elevated p-2">
            {message}
          </pre>
        </details>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-accent-primary px-4 py-2 text-sm text-accent-primary hover:bg-accent-primary/10"
        >
          重试
        </button>
      </div>
    </div>
  )
}
