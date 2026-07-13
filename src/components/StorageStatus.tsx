'use client'

import { useEffect, useState } from 'react'

import { getProductionStorage } from '@/lib/persistence/client/storage'
import { isShowcaseMode } from '@/lib/runtime/app-mode'

/**
 * StorageStatus -- 显示写队列状态
 *
 * 评审 3.2.3 + 6.1 D5 定案：
 *   - 有 pending 时显示「未保存数据」
 *   - 有 failed 时显示「保存失败」+ 「重试」按钮
 *   - showcase 模式不渲染
 *
 * Phase 3 AppShell mount 后挂这个组件到全局 layout。
 * 本任务只建组件，不接入 layout（Phase 3 接入）。
 */

export function StorageStatus(): React.JSX.Element | null {
  const [pending, setPending] = useState(false)
  const [failedCount, setFailedCount] = useState(0)

  useEffect(() => {
    if (isShowcaseMode) return // showcase 模式不监听
    const repo = getProductionStorage()

    // 轮询写队列状态（避免引入全局状态管理）
    const interval = setInterval(() => {
      setPending(repo.hasPending())
      setFailedCount(repo.getFailedTasks().length)
    }, 500)

    return () => clearInterval(interval)
  }, [])

  if (isShowcaseMode) return null
  if (!pending && failedCount === 0) return null

  const handleRetry = (): void => {
    if (isShowcaseMode) return
    getProductionStorage().retryFailed()
  }

  if (failedCount > 0) {
    return (
      <div
        role="alert"
        className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-red-300/40 bg-red-900/40 px-4 py-3 text-sm text-red-100 shadow-lg backdrop-blur"
      >
        <div className="font-medium">保存失败（{failedCount} 项）</div>
        <div className="mt-1 text-red-200/80">数据未落盘到本地数据库。</div>
        <button
          type="button"
          onClick={handleRetry}
          className="mt-2 rounded border border-red-300/60 px-3 py-1 text-xs hover:bg-red-800/60"
        >
          重试
        </button>
      </div>
    )
  }

  // pending 状态（弱提示，无操作）
  return (
    <div
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-amber-300/40 bg-amber-900/30 px-4 py-2 text-xs text-amber-100/80 shadow-sm backdrop-blur"
      aria-live="polite"
    >
      正在保存...
    </div>
  )
}
