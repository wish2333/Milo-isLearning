/**
 * Compile Store — 编译过程临时状态（Zustand，不持久化）
 *
 * 对应 docs/M4-M5-Plan.md W2 编译中页的状态管理。
 *
 * 职责：
 *   - 接收 SSE CompileEvent 流并更新 UI 状态
 *   - 编译完成后持有 Module 产物（供路由跳转前写入持久化层）
 *   - 编译失败时持有 error payload（供 UI 展示重试按钮）
 *
 * 不使用 persist：编译是一次性操作，刷新页面即重置。
 */

import { create } from 'zustand'

import type { CompileErrorPayload, CompileStage, CompileEvent } from '@/lib/compiler/pipeline/types'
import type { Module } from '@/types/domain'

export type CompileStatus = 'idle' | 'compiling' | 'complete' | 'error'

interface CompileState {
  status: CompileStatus
  stage: CompileStage | null
  percent: number
  message: string | null
  error: CompileErrorPayload | null
  /** 编译产物（status === 'complete' 时有值） */
  module: Module | null

  /** 处理 SSE 事件，自动更新状态 */
  handleEvent: (event: CompileEvent) => void

  /** 重置为 idle */
  reset: () => void
}

const initialState = {
  status: 'idle' as CompileStatus,
  stage: null,
  percent: 0,
  message: null,
  error: null,
  module: null,
}

export const useCompileStore = create<CompileState>()((set) => ({
  ...initialState,

  handleEvent: (event) => {
    switch (event.kind) {
      case 'stage_enter':
        set({
          status: 'compiling',
          stage: event.stage,
          percent: 0,
          message: null,
        })
        break
      case 'progress':
        set({
          status: 'compiling',
          stage: event.stage,
          percent: event.percent,
          message: event.message ?? null,
        })
        break
      case 'complete':
        set({
          status: 'complete',
          module: event.module,
          percent: 100,
          message: null,
          error: null,
        })
        break
      case 'error':
        set({
          status: 'error',
          error: event.error,
          message: event.error.message,
        })
        break
    }
  },

  reset: () => set(initialState),
}))
