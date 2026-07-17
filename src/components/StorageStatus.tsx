'use client'

import { useEffect, useState } from 'react'

import { getProductionStorage } from '@/lib/persistence/client/storage'
import type { WriteTask } from '@/lib/persistence/client/write-queue'
import { isShowcaseMode } from '@/lib/runtime/app-mode'

/**
 * StorageStatus -- 显示写队列状态
 *
 * 评审 3.2.3 + 6.1 D5 定案：
 *   - 有 pending 时显示「未保存数据」
 *   - 有 failed 时显示错误详情，并支持逐项或全部重试
 *   - showcase 模式不渲染
 *
 * Phase 3 AppShell mount 后挂这个组件到全局 layout。
 * 本任务只建组件，不接入 layout（Phase 3 接入）。
 */

export function StorageStatus(): React.JSX.Element | null {
  const [pending, setPending] = useState(false)
  const [failedTasks, setFailedTasks] = useState<WriteTask[]>([])

  useEffect(() => {
    if (isShowcaseMode) return // showcase 模式不监听
    const repo = getProductionStorage()
    const refreshStatus = (): void => {
      setPending(repo.hasPending())
      setFailedTasks(repo.getFailedTasks())
    }

    // 轮询写队列状态（避免引入全局状态管理）
    refreshStatus()
    const interval = setInterval(refreshStatus, 500)

    return () => clearInterval(interval)
  }, [])

  if (isShowcaseMode) return null
  if (!pending && failedTasks.length === 0) return null

  const handleRetryAll = (): void => {
    if (isShowcaseMode) return
    getProductionStorage().retryFailed()
  }

  const handleRetryOne = (key: string): void => {
    if (isShowcaseMode) return
    getProductionStorage().retryOne(key)
  }

  if (failedTasks.length > 0) {
    return (
      <div
        role="alert"
        className="fixed bottom-4 right-4 z-50 max-w-md rounded-md border border-red-300/40 bg-red-900/40 px-4 py-3 text-sm text-red-100 shadow-lg backdrop-blur"
      >
        <div className="font-medium">保存失败（{failedTasks.length} 项）</div>
        <div className="mt-1 text-red-200/80">数据未落盘到本地数据库。</div>
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto" aria-label="失败保存任务">
          {failedTasks.map((task) => (
            <li
              key={task.key}
              className="rounded border border-red-300/20 bg-red-950/20 p-2 text-xs"
            >
              <div className="break-all font-medium text-red-100">{task.key}</div>
              <div className="mt-1 break-words text-red-200/80">
                错误：{task.lastError ?? '未知错误'}
              </div>
              <div className="mt-1 text-red-200/70">
                失败时间：
                {task.failedAt !== undefined
                  ? new Date(task.failedAt).toLocaleString('zh-CN')
                  : '未知'}
              </div>
              <button
                type="button"
                onClick={() => handleRetryOne(task.key)}
                className="mt-2 rounded border border-red-300/60 px-2 py-1 hover:bg-red-800/60"
              >
                重试
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={handleRetryAll}
          className="mt-3 rounded border border-red-300/60 px-3 py-1 text-xs hover:bg-red-800/60"
        >
          全部重试
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
