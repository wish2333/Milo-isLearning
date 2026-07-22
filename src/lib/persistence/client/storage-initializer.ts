import 'client-only'

import { isShowcaseMode } from '@/lib/runtime/app-mode'

import { useProgressStore } from '@/lib/state/progress-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useModuleStore } from '@/lib/state/module-store'
import { useRatingStore } from '@/lib/state/rating-store'
import { useTopicSessionStore } from '@/lib/state/topic-session-store'

import { getProductionStorage } from './storage'
import { backfillLegacyStorage } from './legacy-storage-backfill'
import { registerFlushHandlers } from './flush-manager'
import { rebuildAllSchedulesIfNeeded } from '@/lib/runtime/fsrs-migrate'

/**
 * StorageInitializer 状态机（评审 3.2.2 定案）
 *
 * Production 模式启动流程（固定）：
 *   1. AppShell mount
 *   2. 状态机：idle -> loading
 *   3. fetch /api/data/bulk -> 加载全量 cache
 *   4. 检查 LocalStorage 迁移（Phase 5 才实现，本任务占位 no-op）
 *   5. 依次调用 6 个 store 的 persist.rehydrate()
 *   6. 全部成功 -> ready -> 渲染主应用
 *   7. 任一步骤失败 -> error -> 显示错误页 + 重试
 *
 * Showcase 模式：无操作，立即返回 resolved Promise。
 *
 * 幂等：多次调用共享同一个 Promise（避免 React strict mode 双重 effect 重复触发）。
 */

export type StorageInitState = 'idle' | 'loading' | 'ready' | 'error'

let state: StorageInitState = 'idle'
let errorMessage: string | null = null
let pendingPromise: Promise<void> | null = null
let flushCleanup: (() => void) | null = null

export function getStorageInitState(): StorageInitState {
  return state
}

export function getStorageInitError(): string | null {
  return errorMessage
}

/**
 * 初始化客户端 storage。幂等。
 *
 * Showcase 模式：立即返回 resolved Promise。
 * Production 模式：加载 cache + rehydrate 6 stores + 注册 flush。
 */
export function initClientStorage(): Promise<void> {
  // 幂等：共享 Promise
  if (pendingPromise) return pendingPromise

  // showcase 模式：无操作
  if (isShowcaseMode) {
    state = 'ready'
    return Promise.resolve()
  }

  // 已就绪：直接返回
  if (state === 'ready') return Promise.resolve()

  pendingPromise = doInit()
  return pendingPromise
}

async function doInit(): Promise<void> {
  state = 'loading'
  errorMessage = null

  try {
    // 1. 加载 cache
    const repo = getProductionStorage()
    await repo.loadFromServer()

    // 2. 自动补入旧版 production LocalStorage 数据。
    // 旧版主编译/导入路径可能绕过 SQLite repository；必须在 stores rehydrate
    // 前补齐，否则首次进入题库页时会看到“主题有引用但 Module 不存在”。
    const backfill = await backfillLegacyStorage()
    if (backfill.copied > 0) {
      console.info(`[StorageInitializer] 已从旧 LocalStorage 回填 ${backfill.copied} 项到 SQLite`)
    }

    // 3. 依次 rehydrate 6 stores
    // 注意 rehydrate() 是 async（zustand persist API）
    await useProgressStore.persist.rehydrate()
    await useSettingsStore.persist.rehydrate()
    await useAttemptsStore.persist.rehydrate()
    await useModuleStore.persist.rehydrate()
    await useRatingStore.persist.rehydrate()
    await useTopicSessionStore.persist.rehydrate()

    // 6 个 store 都完成 rehydrate 后再回填 FSRS 派生缓存。这样旧 attempts、Module
    // 和当前设置均已可读；showcase 在 initClientStorage 入口直接跳过整个流程。
    const settings = useSettingsStore.getState()
    rebuildAllSchedulesIfNeeded({
      repository: repo,
      attemptsBySlot: useAttemptsStore.getState().attemptsBySlot,
      fsrsConfig: settings.fsrs,
    })

    // 5. 注册 flush handler（页面隐藏时强制落盘）
    if (flushCleanup) flushCleanup() // 先清理旧的（HMR 安全）
    flushCleanup = registerFlushHandlers({
      flushNow: () => repo.flushNow(),
    })

    state = 'ready'
  } catch (err) {
    state = 'error'
    errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[StorageInitializer] 初始化失败：', errorMessage)
    // 不清 pendingPromise，下次调用仍可重试
    pendingPromise = null
    throw err
  }
}

/** 手动重试（从 error 状态恢复）。 */
export function retryInit(): Promise<void> {
  if (state !== 'error') {
    console.warn('[StorageInitializer] retryInit() 在非 error 状态下被调用，忽略')
    return Promise.resolve()
  }
  state = 'idle'
  pendingPromise = null
  return initClientStorage()
}

/**
 * 重新 rehydrate 所有 6 个 Zustand store。
 *
 * 用于迁移完成后重新加载 cache 后，让 store 从最新数据恢复状态。
 * 独立于 doInit 流程，可由 AppShell 的 MigrationOrchestrator 调用。
 */
export async function rehydrateAllStores(): Promise<void> {
  await useProgressStore.persist.rehydrate()
  await useSettingsStore.persist.rehydrate()
  await useAttemptsStore.persist.rehydrate()
  await useModuleStore.persist.rehydrate()
  await useRatingStore.persist.rehydrate()
  await useTopicSessionStore.persist.rehydrate()
}

/**
 * 测试用：重置所有内部状态。
 * 清掉单例 + state + error。生产代码勿调。
 */
export function _resetForTests(): void {
  state = 'idle'
  errorMessage = null
  pendingPromise = null
  if (flushCleanup) {
    flushCleanup()
    flushCleanup = null
  }
}
