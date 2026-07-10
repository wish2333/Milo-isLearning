'use client'

/**
 * 编译中页 — SSE 流式进度展示（M7.5 Task 4 增加刷新恢复）
 *
 * 对应 docs/M4-M5-Plan.md W2 / FR-02 / US-04/06 + docs/M7.5-Plan.md §Task 4。
 *
 * 行为：
 *   - 优先从 URL ?jobId=... 读取 compile job；回退到 sessionStorage 或最近 job
 *   - 在 SSE 事件到达时同步更新 compile job store（status/stage/percent/moduleId/errorMessage）
 *   - 编译完成 → 写 module + source + qualityReport → 路由 overview
 *   - 刷新后若无 sessionStorage（活跃会话源），但 job 存在：
 *       complete & module 仍在 → 路由 overview
 *       running / error → 显示恢复界面（重新开始 / 返回修改 / 放弃）
 *
 * M7.5 不做"按 stage 续编"——「重新开始」会重新发起 /api/compile 请求。
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState, useTransition } from 'react'

import type { CompileConfig, CompileEvent } from '@/lib/compiler/pipeline/types'

import { storage } from '@/lib/persistence/local-storage'
import { assignLocalModuleIdentity } from '@/lib/persistence/module-package'
import { ensureCapacity } from '@/lib/persistence/quota'
import { StorageKeys } from '@/lib/persistence/keys'
import {
  clearCompileJob,
  createCompileJob,
  getCompileJob,
  getLatestCompileJob,
  pruneCompileJobs,
  updateCompileJob,
  type CompileJob,
} from '@/lib/state/compile-job-store'
import { useCompileStore } from '@/lib/state/compile-store'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import { track } from '@/lib/runtime/analytics'

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

type RecoveryChoice = 'restart' | 'modify' | 'abandon' | null

export default function CompilingPage() {
  return (
    <Suspense fallback={<CompilingFallback />}>
      <CompilingPageInner />
    </Suspense>
  )
}

function CompilingFallback() {
  return (
    <main className="min-h-screen bg-bg-base text-fg-primary flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-2">
        <p className="text-sm text-fg-secondary">正在加载编译上下文...</p>
      </div>
    </main>
  )
}

function CompilingPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const config = useSettingsStore((s) => s.config)
  const handleEvent = useCompileStore((s) => s.handleEvent)
  const resetCompile = useCompileStore((s) => s.reset)
  const compileState = useCompileStore()

  const setModule = useModuleStore((s) => s.setModule)
  const startModule = useProgressStore((s) => s.startModule)

  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [storeReady, setStoreReady] = useState(false)
  const [recoveryJob, setRecoveryJob] = useState<CompileJob | null>(null)
  const [recoveryChoice, setRecoveryChoice] = useState<RecoveryChoice>(null)
  const startedRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const jobIdRef = useRef<string | null>(null)
  const streamStartTimeRef = useRef(Date.now())
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

  // ---------- 判断是否处于"刷新后恢复"场景 ----------
  // 检查条件：URL ?jobId 存在，但 sessionStorage 中无 SOURCE_KEY（活跃会话已断）
  useEffect(() => {
    if (!storeReady) return
    const jobIdFromUrl = searchParams.get('jobId')
    const hasActiveSession = sessionStorage.getItem(SOURCE_KEY) !== null

    if (hasActiveSession) {
      // 正常路径：从 import 页跳转过来，立即开始编译
      return
    }

    // 刷新后场景：尝试找 job
    let job: CompileJob | null = null
    if (jobIdFromUrl) {
      job = getCompileJob(storage, jobIdFromUrl)
    }
    if (!job) {
      job = getLatestCompileJob(storage)
    }

    if (!job) {
      // 无任何 job：直接退回 import
      router.replace('/learn/import')
      return
    }

    // job 完成且 module 仍在 → 路由 overview
    if (job.status === 'complete' && job.moduleId) {
      const moduleExists = storage.has(StorageKeys.module(job.moduleId))
      if (moduleExists) {
        const storedModule = storage.get<Parameters<typeof setModule>[0]>(
          StorageKeys.module(job.moduleId),
        )
        if (storedModule) {
          setModule(storedModule)
          startTransition(() => router.replace('/learn/overview'))
          return
        }
      }
      // module 已被删除/清理：当作需要重新开始
    }

    // 否则进入恢复界面
    setRecoveryJob(job)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeReady])

  // ---------- 启动编译 ----------
  useEffect(() => {
    if (!storeReady) return
    if (startedRef.current) return
    if (recoveryJob !== null) return // 等待用户选择
    if (recoveryChoice !== 'restart') {
      // 首次进入（无 recoveryJob）也允许继续，相当于 recoveryChoice === null 的正常路径
    }
    startedRef.current = true

    const rawMarkdown = sessionStorage.getItem(SOURCE_KEY)
    if (!rawMarkdown) {
      // 不应该发生（recoveryJob 路径会拦截），保险起见
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

    // 确保 jobId 存在（如果是从 import 跳来且 import 写过 job，这里只是确认）
    if (!jobIdRef.current) {
      const urlJobId = searchParams.get('jobId')
      if (urlJobId && getCompileJob(storage, urlJobId)) {
        jobIdRef.current = urlJobId
      } else {
        // 创建新 job（兜底；import 页应该已经创建过）
        const job = createCompileJob(storage, {
          sourceContent: rawMarkdown,
          configSummary: { provider: config.provider, model: config.model },
        })
        jobIdRef.current = job.jobId
      }
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
              syncJobFromEvent(parsed)

              // 编译完成 → 持久化 + 路由
              if (parsed.kind === 'complete') {
                const compiledModule = assignLocalModuleIdentity(parsed.module)

                // 写入 repository（持久化 + quota 检查）
                ensureCapacity(storage, JSON.stringify(compiledModule).length)
                storage.set(StorageKeys.module(compiledModule.id), compiledModule)
                storage.set(StorageKeys.source(compiledModule.sourceId), {
                  id: compiledModule.sourceId,
                  type: 'markdown',
                  content: rawMarkdown,
                  createdAt: Date.now(),
                })
                // M7.5：持久化 qualityReport
                if (parsed.qualityReport) {
                  storage.set(StorageKeys.qualityReport(compiledModule.id), {
                    ...parsed.qualityReport,
                    moduleId: compiledModule.id,
                  })
                }

                // 写入 stores
                setModule(compiledModule)
                startModule(compiledModule.id)

                // 清理 compile job / sessionStorage
                if (jobIdRef.current) {
                  updateCompileJob(storage, jobIdRef.current, {
                    status: 'complete',
                    moduleId: compiledModule.id,
                    percent: 100,
                  })
                  pruneCompileJobs(storage)
                }
                sessionStorage.removeItem(SOURCE_KEY)
                sessionStorage.setItem('alc:module-saved-confirmation', '1')

                track('compile_complete', {
                  durationMs: Date.now() - streamStartTimeRef.current,
                  conceptCount: compiledModule.concepts.length,
                  quizCount: compiledModule.concepts.reduce(
                    (sum, c) => sum + c.quizSeries.quizzes.length,
                    0,
                  ),
                })

                // 路由到概览页
                startTransition(() => {
                  router.push('/learn/overview')
                })
                return
              }

              if (parsed.kind === 'error') {
                if (jobIdRef.current) {
                  updateCompileJob(storage, jobIdRef.current, {
                    status: 'error',
                    errorMessage: parsed.error.message,
                  })
                }
                track('compile_failed', {
                  errorCode: parsed.error.code ?? 'unknown',
                  durationMs: Date.now() - streamStartTimeRef.current,
                })
                setError(parsed.error.message)
                return
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const msg = err instanceof Error ? err.message : '编译过程中发生未知错误'
          if (jobIdRef.current) {
            updateCompileJob(storage, jobIdRef.current, {
              status: 'error',
              errorMessage: msg,
            })
          }
          setError(msg)
        }
      }
    }

    streamCompile()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount, storeReady, recoveryJob, recoveryChoice])

  // 真正的 unmount cleanup：用户导航离开时中止 fetch
  // 与主 effect 分离，避免 React Strict Mode 双挂载时 abort 掉唯一请求
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  // ---------- job 同步 helper ----------

  function syncJobFromEvent(event: CompileEvent): void {
    if (!jobIdRef.current) return
    if (event.kind === 'stage_enter') {
      updateCompileJob(storage, jobIdRef.current, { stage: event.stage })
    } else if (event.kind === 'progress') {
      updateCompileJob(storage, jobIdRef.current, {
        stage: event.stage,
        percent: event.percent,
      })
    }
  }

  // ---------- retry / restart / recovery handlers ----------

  const handleRetry = () => {
    resetCompile()
    setError(null)
    startedRef.current = false
    streamStartTimeRef.current = Date.now()
    setRetryCount((c) => c + 1)
  }

  const handleRecoveryRestart = () => {
    if (!recoveryJob) return
    setRecoveryChoice('restart')
    // 把 source 重新塞回 sessionStorage，让主 effect 走正常路径
    sessionStorage.setItem(SOURCE_KEY, recoveryJob.sourceContent)
    // 旧 job 不再需要（用户已选择重新开始）
    clearCompileJob(storage, recoveryJob.jobId)
    setRecoveryJob(null)
    startedRef.current = false
    // 创建新 job
    if (config) {
      const newJob = createCompileJob(storage, {
        sourceContent: recoveryJob.sourceContent,
        configSummary: recoveryJob.configSummary,
      })
      jobIdRef.current = newJob.jobId
      // 替换 URL jobId（不刷新页面）
      window.history.replaceState(null, '', `/learn/compiling?jobId=${newJob.jobId}`)
    }
    resetCompile()
    setRecoveryChoice(null)
    setRetryCount((c) => c + 1)
  }

  const handleRecoveryModify = () => {
    if (!recoveryJob) return
    setRecoveryChoice('modify')
    sessionStorage.setItem(SOURCE_KEY, recoveryJob.sourceContent)
    router.push('/learn/import')
  }

  const handleRecoveryAbandon = () => {
    setRecoveryChoice('abandon')
    if (recoveryJob) {
      clearCompileJob(storage, recoveryJob.jobId)
    }
    sessionStorage.removeItem(SOURCE_KEY)
    router.push('/learn/library')
  }

  // --- 渲染 ---

  // 恢复界面（recoveryJob 非空且尚未选择）
  if (recoveryJob && recoveryChoice === null) {
    const lastStageLabel = recoveryJob.stage
      ? (STAGE_LABELS[recoveryJob.stage] ?? recoveryJob.stage)
      : '未知阶段'
    return (
      <main className="alc-page items-center justify-center p-6">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-fg-primary">已恢复上次编译上下文</h2>
            <p className="text-sm text-fg-secondary leading-relaxed">
              M7.5 会保留源文本和进度提示；继续时会重新发起编译请求。
            </p>
          </div>

          <div className="alc-card p-4 space-y-2 text-left text-sm">
            <div className="flex justify-between">
              <span className="alc-label">上次状态</span>
              <span className="text-fg-primary">{recoveryJob.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="alc-label">最后阶段</span>
              <span className="text-fg-primary">{lastStageLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="alc-label">进度</span>
              <span className="text-fg-primary tabular-nums">{recoveryJob.percent}%</span>
            </div>
            {recoveryJob.errorMessage && (
              <div className="pt-2 text-xs alc-danger border-t border-border-subtle">
                上次错误：{recoveryJob.errorMessage}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={handleRecoveryRestart}
              className="alc-button-primary w-full"
            >
              重新开始编译
            </button>
            <button
              type="button"
              onClick={handleRecoveryModify}
              className="alc-button-secondary w-full"
            >
              返回修改源文本
            </button>
            <button
              type="button"
              onClick={handleRecoveryAbandon}
              className="alc-button-danger w-full"
            >
              放弃
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-bg-base text-fg-primary flex flex-col items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
            <span className="text-red-400 text-xl">!</span>
          </div>
          <h2 className="text-lg font-medium">编译遇到问题</h2>
          <p className="text-sm text-fg-secondary">{error}</p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-md bg-accent-primary text-bg-base text-sm hover:bg-accent-primary-hover"
            >
              重试
            </button>
            <button
              onClick={() => router.push('/learn/import')}
              className="px-4 py-2 rounded-md border border-border-strong text-fg-secondary text-sm hover:bg-bg-elevated"
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
    <main className="min-h-screen bg-bg-base text-fg-primary flex flex-col items-center justify-center p-6">
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
                className="text-fg-quaternary"
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
                className="text-fg-secondary transition-all duration-500"
                transform="rotate(-90 32 32)"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs text-fg-secondary">
              {percent}%
            </span>
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm text-fg-secondary">{stageLabel}</p>
            {message && <p className="text-xs text-fg-tertiary">{message}</p>}
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
                  isActive ? 'text-fg-primary' : isPast ? 'text-fg-tertiary' : 'text-fg-quaternary'
                }`}
              >
                <span
                  className={`w-1 h-1 rounded-full ${isActive ? 'bg-accent-primary' : isPast ? 'bg-state-completed' : 'bg-bg-elevated'}`}
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
