'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { isShowcaseMode } from '@/lib/runtime/app-mode'
import {
  initClientStorage,
  getStorageInitState,
  getStorageInitError,
  retryInit,
  rehydrateAllStores,
  type StorageInitState,
} from '@/lib/persistence/client/storage-initializer'

import { StorageLoading } from './StorageLoading'
import { StorageError } from './StorageError'
import { MigrationOrchestrator } from './migration/MigrationOrchestrator'

/**
 * AppShell -- 应用根包装层
 *
 * 评审 3.2.2 定案：
 *   - Production 模式：mount 时调用 initClientStorage，加载 cache + rehydrate 6 stores，
 *     全部完成后渲染 children；失败显示 StorageError 全屏页 + 重试。
 *   - Showcase 模式：立即渲染 children，无 loading/error 状态（零回归）。
 */

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  // showcase 模式：直接渲染，无任何副作用
  if (isShowcaseMode) {
    return <>{children}</>
  }

  return <ProductionAppShell>{children}</ProductionAppShell>
}

/**
 * Production 模式的 AppShell。单独抽出来避免 showcase 模式时执行其 useEffect。
 */
function ProductionAppShell({ children }: AppShellProps) {
  const [state, setState] = useState<StorageInitState>(getStorageInitState())

  useEffect(() => {
    // 触发初始化
    initClientStorage()
      .then(() => setState(getStorageInitState()))
      .catch(() => setState('error'))

    // 状态可能由 retryInit 等改变，定期同步（500ms 间隔足够）
    const interval = setInterval(() => {
      const current = getStorageInitState()
      setState((prev) => (prev === current ? prev : current))
    }, 500)

    return () => clearInterval(interval)
  }, [])

  const handleRetry = (): void => {
    retryInit()
      .then(() => setState(getStorageInitState()))
      .catch(() => setState('error'))
  }

  const handleMigrationComplete = useCallback(async () => {
    await rehydrateAllStores()
  }, [])

  if (state === 'loading' || state === 'idle') {
    return <StorageLoading />
  }

  if (state === 'error') {
    return <StorageError message={getStorageInitError() ?? '未知错误'} onRetry={handleRetry} />
  }

  // state === 'ready'
  return (
    <>
      {children}
      <MigrationOrchestrator enabled={true} onMigrationComplete={handleMigrationComplete} />
    </>
  )
}
