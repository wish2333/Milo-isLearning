'use client'

/**
 * 编译中页 — SSE 流式进度展示
 *
 * 对应 docs/M4-M5-Plan.md W2 / FR-02 / US-04/06。
 * UI 参考：docs/ui-design/02-compiling.html
 *
 * 功能：
 *   - 从 sessionStorage 读取 rawMarkdown
 *   - POST /api/compile（fetch + ReadableStream 解析 SSE）
 *   - 按 stage_enter / progress / complete / error 更新 UI
 *   - 编译完成 → 写入 module-store + repository → 路由到 /learn/overview
 *   - 编译失败 → 显示错误 + 重试按钮
 */

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import type { CompileConfig, CompileEvent } from '@/lib/compiler/pipeline/types'

import { storage } from '@/lib/persistence/local-storage'
import { ensureCapacity } from '@/lib/persistence/quota'
import { StorageKeys } from '@/lib/persistence/keys'
import { useCompileStore } from '@/lib/state/compile-store'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useSettingsStore } from '@/lib/state/settings-store'

const SOURCE_KEY = 'alc:compile-source'

/** 编译阶段中文文案 */
const STAGE_LABELS: Record<string, string> = {
  import: '正在清理文本',
  chunk: '正在切分知识块',
  concept: '正在提取核心概念',
  module: '正在构建学习模块',
  mission: '正在规划练习序列',
  quiz: '正在生成练习题',
  challenge: '正在生成综合挑战题',
  feynman: '正在设计费曼任务',
}

export default function CompilingPage() {
  const router = useRouter()
  const config = useSettingsStore((s) => s.config)
  const handleEvent = useCompileStore((s) => s.handleEvent)
  const resetCompile = useCompileStore((s) => s.reset)
  const compileState = useCompileStore()

  const setModule = useModuleStore((s) => s.setModule)
  const startModule = useProgressStore((s) => s.startModule)

  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [storeReady, setStoreReady] = useState(false)
  const startedRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const [, startTransition] = useTransition()

  // 等待 Zustand persist 水合完成（防止刷新页面时 config 为 null）
  useEffect(() => {
    if (useSettingsStore.persist.hasHydrated()) {
      setStoreReady(true)
    } else {
      const unsub = useSettingsStore.persist.onFinishHydration(() => setStoreReady(true))
      return unsub
    }
  }, [])

  // 启动编译
  useEffect(() => {
    if (!storeReady) return
    if (startedRef.current) return
    startedRef.current = true

    const rawMarkdown = sessionStorage.getItem(SOURCE_KEY)
    if (!rawMarkdown) {
      setError('未找到待编译的源文本，请返回重新输入')
      return
    }

    if (!config) {
      router.push('/settings')
      return
    }

    const compileConfig: CompileConfig = {
      compileModel: config.model,
      lightweightModel: config.model,
      llm: config,
    }

    // SSE 流式读取 — 用 ref 保存 controller 避免 Strict Mode 双挂载 abort
    const controller = new AbortController()
    controllerRef.current = controller

    async function streamCompile() {
      try {
        const response = await fetch('/api/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawMarkdown, config: compileConfig }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`编译请求失败: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('无法读取响应流')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // 按 SSE 事件边界分割（\n\n 或 \r\n\r\n）
          const normalized = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
          const events = normalized.split('\n\n')
          buffer = events.pop() ?? ''

          for (const rawEvent of events) {
            const parsed = parseSSE(rawEvent)
            if (parsed) {
              handleEvent(parsed)

              // 编译完成 → 持久化 + 路由
              if (parsed.kind === 'complete') {
                const compiledModule = parsed.module

                // 写入 repository（持久化 + quota 检查）
                ensureCapacity(storage, JSON.stringify(compiledModule).length)
                storage.set(StorageKeys.module(compiledModule.id), compiledModule)
                storage.set(StorageKeys.source(compiledModule.sourceId), {
                  id: compiledModule.sourceId,
                  type: 'markdown',
                  content: rawMarkdown,
                  createdAt: Date.now(),
                })

                // 写入 stores
                setModule(compiledModule)
                startModule(compiledModule.id)

                // 清理 sessionStorage
                sessionStorage.removeItem(SOURCE_KEY)

                // 路由到概览页
                startTransition(() => {
                  router.push('/learn/overview')
                })
                return
              }

              if (parsed.kind === 'error') {
                setError(parsed.error.message)
                return
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : '编译过程中发生未知错误')
        }
      }
    }

    streamCompile()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount, storeReady])

  // 真正的 unmount cleanup：用户导航离开时中止 fetch
  // 与主 effect 分离，避免 React Strict Mode 双挂载时 abort 掉唯一请求
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  const handleRetry = () => {
    resetCompile()
    setError(null)
    startedRef.current = false
    setRetryCount((c) => c + 1)
  }

  // --- 渲染 ---

  if (error) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <span className="text-red-400 text-xl">!</span>
          </div>
          <h2 className="text-lg font-medium">编译遇到问题</h2>
          <p className="text-sm text-neutral-400">{error}</p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-md bg-neutral-100 text-neutral-900 text-sm hover:bg-white"
            >
              重试
            </button>
            <button
              onClick={() => router.push('/learn/import')}
              className="px-4 py-2 rounded-md border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-900"
            >
              返回修改
            </button>
          </div>
        </div>
      </main>
    )
  }

  const { stage, percent, message } = compileState
  const stageLabel = stage ? (STAGE_LABELS[stage] ?? stage) : '准备中...'

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        {/* Spinner / Progress */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 relative">
            <svg className="animate-spin-slow w-full h-full" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-neutral-800"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${(percent / 100) * 176} 176`}
                strokeLinecap="round"
                className="text-neutral-300 transition-all duration-500"
                transform="rotate(-90 32 32)"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">
              {percent}%
            </span>
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm text-neutral-300">{stageLabel}</p>
            {message && <p className="text-xs text-neutral-600">{message}</p>}
          </div>
        </div>

        {/* Stage list */}
        <div className="space-y-1">
          {Object.entries(STAGE_LABELS).map(([key, label]) => {
            const isActive = stage === key
            const isPast =
              stage &&
              Object.keys(STAGE_LABELS).indexOf(stage) > Object.keys(STAGE_LABELS).indexOf(key)
            return (
              <div
                key={key}
                className={`flex items-center gap-2 text-xs py-1 ${
                  isActive ? 'text-neutral-200' : isPast ? 'text-neutral-500' : 'text-neutral-700'
                }`}
              >
                <span
                  className={`w-1 h-1 rounded-full ${isActive ? 'bg-neutral-300' : isPast ? 'bg-neutral-600' : 'bg-neutral-800'}`}
                />
                {label}
              </div>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        @keyframes spin-slow {
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </main>
  )
}

// =================================================================
// SSE 解析工具
// =================================================================

/**
 * 解析单个 SSE 事件文本块。
 *
 * 输入格式：
 *   event: stage_enter
 *   data: {"kind":"stage_enter","stage":"import"}
 *
 * 输出：CompileEvent | null
 */
function parseSSE(raw: string): CompileEvent | null {
  const lines = raw.trim().split('\n')
  let dataStr = ''

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      dataStr += line.slice(6)
    } else if (line.startsWith('data:')) {
      dataStr += line.slice(5)
    }
  }

  if (!dataStr) return null

  try {
    return JSON.parse(dataStr) as CompileEvent
  } catch {
    return null
  }
}
