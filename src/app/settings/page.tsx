'use client'

/**
 * 设置页 — LLM 供应商配置
 *
 * 对应 docs/M6-Plan.md W7 / Tech Spec §6.2。
 *
 * 功能：
 *   - Provider 选择（DeepSeek / GLM / SenseNova）
 *   - API Key 输入（密码类型，可切换显示/隐藏）
 *   - 模型名 + baseURL（选择 Provider 时自动填充默认值）
 *   - Ping 测试（通过 /api/ping 在服务端调用，避免 CORS）
 *   - 保存 / 清除配置
 */

import { useRouter } from 'next/navigation'
import { useState, useCallback, useEffect } from 'react'

import { useSettingsStore } from '@/lib/state/settings-store'
import { useHydrated } from '@/lib/hooks/useHydrated'
import type { LLMConfig, PingResult, ProviderKind } from '@/lib/providers/types'

/** 各 Provider 的默认配置 */
const PROVIDER_DEFAULTS: Record<
  ProviderKind,
  { baseURL: string; model: string; label: string; hint: string }
> = {
  deepseek: {
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    label: 'DeepSeek',
    hint: '原生 DeepSeek API。模型：deepseek-v4-flash（快速）/ deepseek-v4-pro（强）',
  },
  glm: {
    baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
    model: 'glm-5.2',
    label: 'GLM (智谱)',
    hint: '智谱 Coding Plan 端点。模型：glm-5.2（旗舰）/ glm-5-turbo（快速）',
  },
  sensenova: {
    baseURL: 'https://token.sensenova.cn/v1',
    model: 'deepseek-v4-flash',
    label: 'SenseNova (商汤)',
    hint: '商汤 SenseNova 通道，托管 deepseek-v4-flash',
  },
}

const PROVIDER_LIST: ProviderKind[] = ['deepseek', 'glm', 'sensenova']

export default function SettingsPage() {
  const router = useRouter()
  const hydrated = useHydrated()
  const config = useSettingsStore((s) => s.config)
  const setConfig = useSettingsStore((s) => s.setConfig)
  const clearConfig = useSettingsStore((s) => s.clear)

  // 表单状态（从已保存配置初始化或用默认值）
  const [provider, setProvider] = useState<ProviderKind>(config?.provider ?? 'deepseek')
  const [apiKey, setApiKey] = useState(config?.apiKey ?? '')
  const [model, setModel] = useState(config?.model ?? PROVIDER_DEFAULTS.deepseek.model)
  const [baseURL, setBaseURL] = useState(config?.baseURL ?? PROVIDER_DEFAULTS.deepseek.baseURL)
  const [showKey, setShowKey] = useState(false)
  const availableKeys = useSettingsStore((s) => s.availableKeys)
  const [pinging, setPinging] = useState(false)
  const [pingResult, setPingResult] = useState<PingResult | null>(null)
  const [saved, setSaved] = useState(false)

  // 当 config 异步加载完成（如从 .env.local 自动加载）后，同步表单
  useEffect(() => {
    if (config) {
      setProvider(config.provider)
      setApiKey(config.apiKey)
      setModel(config.model)
      setBaseURL(config.baseURL ?? PROVIDER_DEFAULTS[config.provider].baseURL)
    }
  }, [config])

  const handleProviderChange = (kind: ProviderKind) => {
    setProvider(kind)
    setModel(PROVIDER_DEFAULTS[kind].model)
    setBaseURL(PROVIDER_DEFAULTS[kind].baseURL)
    // 自动填充该供应商的 API Key（从 .env.local 加载）
    const key = availableKeys?.[kind]
    if (key) {
      setApiKey(key)
    }
    setPingResult(null)
    setSaved(false)
  }

  const handlePing = useCallback(async () => {
    if (!apiKey.trim() || !model.trim()) return

    setPinging(true)
    setPingResult(null)

    try {
      const response = await fetch('/api/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { provider, apiKey, model, baseURL },
        }),
      })

      if (!response.ok) {
        throw new Error(`Ping API 失败: ${response.status}`)
      }

      const result: PingResult = await response.json()
      setPingResult(result)
    } catch (err) {
      setPingResult({
        ok: false,
        latencyMs: 0,
        message: err instanceof Error ? err.message : 'Ping 失败',
      })
    } finally {
      setPinging(false)
    }
  }, [provider, apiKey, model, baseURL])

  const handleSave = () => {
    const newConfig: LLMConfig = {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      baseURL: baseURL.trim(),
    }
    setConfig(newConfig)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = () => {
    clearConfig()
    setApiKey('')
    setProvider('deepseek')
    setModel(PROVIDER_DEFAULTS.deepseek.model)
    setBaseURL(PROVIDER_DEFAULTS.deepseek.baseURL)
    setPingResult(null)
    setSaved(false)
  }

  const canSave = apiKey.trim().length > 0 && model.trim().length > 0
  const canPing = canSave && !pinging

  // hydration 前不渲染表单（避免 SSR/localStorage 不匹配）
  if (!hydrated) {
    return (
      <main className="alc-page items-center justify-center">
        <p className="alc-muted text-sm">加载中...</p>
      </main>
    )
  }

  return (
    <main className="alc-page">
      <div className="max-w-xl mx-auto px-6 py-12 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <button onClick={() => router.push('/')} className="alc-link text-xs">
            ← 返回首页
          </button>
          <h1 className="text-2xl font-semibold text-fg-primary">LLM 配置</h1>
          <p className="text-sm text-fg-secondary">
            配置 AI 供应商以启用编译功能。API Key 仅存储在浏览器 LocalStorage 中。
          </p>
        </div>

        {/* 已保存配置提示 */}
        {config && (
          <div className="alc-card border-success/40 bg-success-soft px-4 py-3 space-y-1">
            <p className="text-xs text-success">
              当前已配置：{PROVIDER_DEFAULTS[config.provider].label} / {config.model}
            </p>
            <p className="alc-muted text-xs">
              API Key: {config.apiKey.slice(0, 4)}...{config.apiKey.slice(-4)}
            </p>
          </div>
        )}

        {/* Provider 选择 */}
        <div className="space-y-3">
          <label className="alc-label uppercase tracking-wider">供应商</label>
          <div className="grid grid-cols-3 gap-2">
            {PROVIDER_LIST.map((kind) => (
              <button
                key={kind}
                onClick={() => handleProviderChange(kind)}
                data-active={provider === kind}
                className="alc-pill-button text-sm font-medium"
              >
                {PROVIDER_DEFAULTS[kind].label}
              </button>
            ))}
          </div>
          <p className="alc-muted text-xs">{PROVIDER_DEFAULTS[provider].hint}</p>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <label className="alc-label uppercase tracking-wider">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setPingResult(null)
                setSaved(false)
              }}
              placeholder="sk-..."
              className="alc-input pr-20 text-sm font-mono"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 alc-link text-xs"
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
        </div>

        {/* Model */}
        <div className="space-y-2">
          <label className="alc-label uppercase tracking-wider">模型</label>
          <input
            type="text"
            value={model}
            onChange={(e) => {
              setModel(e.target.value)
              setPingResult(null)
              setSaved(false)
            }}
            placeholder="模型 ID"
            className="alc-input text-sm font-mono"
          />
        </div>

        {/* baseURL */}
        <div className="space-y-2">
          <label className="alc-label uppercase tracking-wider">
            Base URL <span className="text-fg-quaternary">(可选，已自动填充默认值)</span>
          </label>
          <input
            type="text"
            value={baseURL}
            onChange={(e) => {
              setBaseURL(e.target.value)
              setPingResult(null)
              setSaved(false)
            }}
            placeholder="https://..."
            className="alc-input text-sm font-mono"
          />
        </div>

        {/* Ping test */}
        <div className="space-y-3">
          <button
            onClick={handlePing}
            disabled={!canPing}
            className="alc-button-secondary text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pinging ? '正在测试...' : '测试连接'}
          </button>

          {pingResult && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                pingResult.ok
                  ? 'border-success/40 bg-success-soft text-success'
                  : 'border-danger/40 bg-danger-soft text-danger'
              }`}
            >
              <span className="font-medium">{pingResult.ok ? '连接成功' : '连接失败'}</span>
              {pingResult.latencyMs > 0 && (
                <span className="text-fg-secondary ml-2">延迟 {pingResult.latencyMs}ms</span>
              )}
              {pingResult.message && (
                <p className="text-xs mt-1 opacity-70">{pingResult.message}</p>
              )}
            </div>
          )}
        </div>

        {/* Save / Clear */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="alc-button-primary flex-1 py-3 text-sm"
          >
            {saved ? '已保存' : '保存配置'}
          </button>
          {config && (
            <button onClick={handleClear} className="alc-button-danger px-4 py-3 text-sm">
              清除
            </button>
          )}
        </div>

        {/* Next step hint */}
        {config && (
          <div className="pt-4 border-t border-border-subtle">
            <p className="alc-muted text-xs mb-2">配置已就绪，下一步：</p>
            <button onClick={() => router.push('/learn/import')} className="alc-link text-sm">
              前往导入知识 →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
