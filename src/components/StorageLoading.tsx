/**
 * StorageLoading -- production 模式启动时的全屏骨架屏
 *
 * 评审 3.2.2 D4 定案：用全屏骨架而不是空白闪烁。
 * Showcase 模式永不渲染此组件。
 */

export function StorageLoading() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        {/* 旋转加载指示，用 CSS animation */}
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-accent-primary/30 border-t-accent-primary"
          aria-hidden="true"
        />
        <p className="font-display text-sm text-fg-secondary">正在加载本地学习数据...</p>
      </div>
    </div>
  )
}
