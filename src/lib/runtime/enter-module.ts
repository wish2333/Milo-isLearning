import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { getStorageValueWithLegacyFallback } from '@/lib/persistence/client/storage'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import type { Module } from '@/types/domain'

export interface EnterModuleOptions {
  moduleId: string
  /**
   * 是否允许恢复已有进度（默认 true）。
   * 用户显式选"重做/重新学习"时传 false，走 startModule 语义。
   */
  allowResume?: boolean
}

/**
 * 进入模块的统一入口。
 *
 * 依赖 Zustand store（useModuleStore / useProgressStore），
 * 因此必须在浏览器环境调用，不能在 SSR / 纯 Node 测试中直接调用
 * （测试需 mock store 与 storage）。
 *
 * 返回 true 表示成功加载，false 表示模块不存在。调用方负责 router.push。
 */
export function enterModule({ moduleId, allowResume = true }: EnterModuleOptions): boolean {
  const storedModule = getStorageValueWithLegacyFallback<Module>(StorageKeys.module(moduleId))
  if (!storedModule) return false

  useModuleStore.getState().setModule(storedModule)

  if (allowResume) {
    useProgressStore.getState().resumeModule(moduleId)
  } else {
    useProgressStore.getState().startModule(moduleId)
  }

  return true
}
