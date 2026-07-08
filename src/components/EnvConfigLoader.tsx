'use client'

/**
 * EnvConfigLoader — 应用启动时自动从 .env.local 加载 LLM 配置
 *
 * 对应 docs/dev-guide.md 首次配置自动化。
 *
 * 行为：
 *   1. 等待 Zustand persist hydration 完成（useHydrated）
 *   2. 检查 settings-store 是否已有配置（LocalStorage 中）
 *   3. 如果没有 → GET /api/env-config → 自动填充
 *   4. 如果已有 → 不覆盖（用户手动配置优先）
 *
 * 此组件不渲染任何 UI，仅作为副作用加载器挂在 layout 中。
 */

import { useEffect } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { useSettingsStore } from '@/lib/state/settings-store'
import type { LLMConfig } from '@/lib/providers/types'

export function EnvConfigLoader() {
  const hydrated = useHydrated()
  const config = useSettingsStore((s) => s.config)
  const setConfig = useSettingsStore((s) => s.setConfig)
  const setAvailableKeys = useSettingsStore((s) => s.setAvailableKeys)

  useEffect(() => {
    if (!hydrated) return
    // 已有配置则不覆盖（用户手动配置优先于环境变量）
    if (config) return

    let cancelled = false

    fetch('/api/env-config')
      .then((res) => res.json())
      .then((data: { config: LLMConfig | null; apiKeys: Record<string, string | null> }) => {
        if (cancelled) return
        // 存储所有供应商的 API Key，供 settings 页切换 provider 时自动填充
        if (data.apiKeys) {
          setAvailableKeys(data.apiKeys)
        }
        if (data.config) {
          setConfig(data.config)
        }
      })
      .catch(() => {
        // 静默失败（.env.local 未配置或网络问题）
      })

    return () => {
      cancelled = true
    }
  }, [hydrated, config, setConfig, setAvailableKeys])

  return null
}
