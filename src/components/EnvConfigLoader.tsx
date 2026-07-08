'use client'

/**
 * EnvConfigLoader — 应用启动时自动从 .env.local 加载 LLM 配置
 *
 * 对应 docs/dev-guide.md 首次配置自动化。
 *
 * 行为：
 *   1. 等待 Zustand persist hydration 完成（useHydrated）
 *   2. GET /api/env-config 始终执行：
 *      - apiKeys（所有供应商的 key）始终存储，供 settings 页切换 provider 时自动填充
 *      - config（默认供应商配置）仅在用户尚未手动配置时填充
 *   3. 已有配置 → 不覆盖 config（用户手动配置优先）
 *
 * 此组件不渲染任何 UI，仅作为副作用加载器挂在 layout 中。
 */

import { useEffect } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { useSettingsStore } from '@/lib/state/settings-store'
import type { LLMConfig } from '@/lib/providers/types'

export function EnvConfigLoader() {
  const hydrated = useHydrated()
  const setConfig = useSettingsStore((s) => s.setConfig)
  const setAvailableKeys = useSettingsStore((s) => s.setAvailableKeys)

  useEffect(() => {
    if (!hydrated) return

    let cancelled = false

    fetch('/api/env-config')
      .then((res) => res.json())
      .then((data: { config: LLMConfig | null; apiKeys: Record<string, string | null> }) => {
        if (cancelled) return
        // 始终存储所有供应商的 API Key，供 settings 页切换 provider 时自动填充
        if (data.apiKeys) {
          setAvailableKeys(data.apiKeys)
        }
        // 仅在用户尚未配置时自动填充默认 config（用户手动配置优先于环境变量）
        if (data.config && !useSettingsStore.getState().config) {
          setConfig(data.config)
        }
      })
      .catch(() => {
        // 静默失败（.env.local 未配置或网络问题）
      })

    return () => {
      cancelled = true
    }
  }, [hydrated, setConfig, setAvailableKeys])

  return null
}
