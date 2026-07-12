/**
 * Settings Store — LLM 供应商配置（Zustand + persist）
 *
 * 对应 docs/Technical-Specification.md §6.2 settings-store。
 *
 * 持久化到 LocalStorage `alc:settings`。
 * 所有页面通过此 store 读取 LLM 配置，不直接访问 LocalStorage。
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { LLMConfig } from '@/lib/providers/types'

/** 可从 .env.local 读取到的供应商 API Key 集合 */
type ApiKeyMap = Record<string, string | null>

interface SettingsState {
  /** LLM 配置；null = 未配置（首次使用 / 已清除） */
  config: LLMConfig | null

  /** 从 .env.local 读取到的所有供应商 API Key，切换 provider 时自动填充 */
  availableKeys: ApiKeyMap | null

  /** 跨概念间隔重复：是否注入"确认掌握题"。默认 true。 */
  confirmReviewEnabled: boolean

  /** 写入完整配置 */
  setConfig: (config: LLMConfig) => void

  /** 存储从 .env.local 加载的所有 API Key */
  setAvailableKeys: (keys: ApiKeyMap) => void

  /** 部分更新配置（合并） */
  updateConfig: (partial: Partial<LLMConfig>) => void

  /** 设置是否启用"确认掌握题" */
  setConfirmReviewEnabled: (enabled: boolean) => void

  /** 清除配置 */
  clear: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      config: null,
      availableKeys: null,
      confirmReviewEnabled: true,

      setConfig: (config) => set({ config }),

      setAvailableKeys: (keys) => set({ availableKeys: keys }),

      updateConfig: (partial) =>
        set((state) => {
          if (!state.config) return state
          return { config: { ...state.config, ...partial } }
        }),

      setConfirmReviewEnabled: (enabled) => set({ confirmReviewEnabled: enabled }),

      clear: () => set({ config: null }),
    }),
    {
      name: 'alc:settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/**
 * 获取当前 LLM 配置（非 React 上下文使用）。
 *
 * @throws Error 当配置未设置时
 */
export function getLLMConfig(): LLMConfig {
  const config = useSettingsStore.getState().config
  if (!config) {
    throw new Error('LLM 配置未设置，请先前往设置页配置')
  }
  return config
}

/** 检查 LLM 配置是否已就绪 */
export function isLLMConfigured(): boolean {
  const config = useSettingsStore.getState().config
  return config !== null && config.apiKey.length > 0 && config.model.length > 0
}
