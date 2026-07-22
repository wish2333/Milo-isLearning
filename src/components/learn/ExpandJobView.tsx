'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { CompileEvent, CompileStage } from '@/lib/compiler/pipeline/types'
import { addModuleToTopic } from '@/lib/persistence/topic-library'
import { getStorage } from '@/lib/persistence/client/storage'
import { loadStoredModule } from '@/lib/persistence/module-library'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { computeModuleProgress } from '@/lib/runtime/module-progress'
import { enterModule } from '@/lib/runtime/enter-module'
import { isProductionMode } from '@/lib/runtime/app-mode'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import type { Module, ProgressState } from '@/types/domain'
import type { ExpandJob, ExpandJobItem } from '@/types/expand-job'

export interface TopicExpandRequest {
  topicId: string
  sourceHash: string
  items: string[]
  constraints?: string
}

interface ExpandJobViewProps {
  initialRequest?: TopicExpandRequest | null
  jobId?: string | null
}

interface StageProgress {
  stage: CompileStage
  percent: number
  message?: string
}

const STAGE_LABELS: Record<CompileStage, string> = {
  expand: '扩充知识材料',
  import: '清理文本',
  chunk: '切分知识块',
  concept: '提取核心概念',
  module: '构建学习模块',
  mission: '规划练习序列',
  quiz: '生成练习题',
  challenge: '生成挑战题',
  feynman: '设计费曼任务',
}

const JOB_STATUS_LABELS: Record<ExpandJob['status'], string> = {
  created: '待开始',
  running: '运行中',
  paused: '已暂停',
  failed: '有失败项',
  completed: '已完成',
  cancelled: '已取消',
}

const ITEM_STATUS_LABELS: Record<ExpandJobItem['status'], string> = {
  queued: '排队中',
  running: '生成中',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

function parseSSE(raw: string): CompileEvent | null {
  const data = raw
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
  if (!data) return null
  try {
    return JSON.parse(data) as CompileEvent
  } catch {
    return null
  }
}

function createOptimisticJob(request: TopicExpandRequest, jobId: string): ExpandJob {
  const now = Date.now()
  const items: ExpandJobItem[] = request.items.map((source, moduleIndex) => ({
    itemId: `pending-${moduleIndex}`,
    moduleIndex,
    topicId: request.topicId,
    source,
    sourceHash: request.sourceHash,
    status: 'queued',
    attempts: 0,
    updatedAt: now,
  }))
  return {
    jobId,
    topicId: request.topicId,
    ...(request.constraints !== undefined ? { constraints: request.constraints } : {}),
    sourceHash: request.sourceHash,
    itemIds: items.map((item) => item.itemId),
    items,
    currentItemId: null,
    status: 'running',
    createdAt: now,
    updatedAt: now,
  }
}

function requestFromJob(job: ExpandJob): TopicExpandRequest | null {
  if (!job.topicId || job.items.length === 0) return null
  return {
    topicId: job.topicId,
    sourceHash: job.sourceHash,
    items: [...job.items].sort((a, b) => a.moduleIndex - b.moduleIndex).map((item) => item.source),
    ...(job.constraints !== undefined ? { constraints: job.constraints } : {}),
  }
}

function findItemIndex(job: ExpandJob, itemId: string, moduleIndex?: number): number {
  const directIndex = job.items.findIndex((item) => item.itemId === itemId)
  if (directIndex >= 0) return directIndex
  if (moduleIndex === undefined) return -1
  return job.items.findIndex((item) => item.moduleIndex === moduleIndex)
}

function replaceItemId(job: ExpandJob, index: number, itemId: string): ExpandJob {
  if (index < 0 || index >= job.items.length || job.items[index]?.itemId === itemId) return job
  const current = job.items[index]!
  const items = job.items.map((item, itemIndex) =>
    itemIndex === index ? { ...item, itemId } : item,
  )
  return {
    ...job,
    itemIds: job.itemIds.map((id, itemIndex) => (itemIndex === index ? itemId : id)),
    items,
    currentItemId: job.currentItemId === current.itemId ? itemId : job.currentItemId,
  }
}

async function readServerValue<T>(key: string): Promise<T | null> {
  const response = await fetch(`/api/data/${encodeURIComponent(key)}`, {
    headers: { Accept: 'text/plain' },
  })
  if (!response.ok) return null
  try {
    return (JSON.parse(await response.text()) as T) ?? null
  } catch {
    return null
  }
}

function statusClass(status: ExpandJobItem['status']): string {
  if (status === 'done') return 'text-success'
  if (status === 'failed') return 'text-danger'
  if (status === 'running') return 'text-accent-primary'
  return 'text-fg-tertiary'
}

export function ExpandJobView({ initialRequest = null, jobId = null }: ExpandJobViewProps) {
  const router = useRouter()
  const storage = isProductionMode ? getStorage() : null
  const config = useSettingsStore((state) => state.config)
  const attemptsBySlot = useAttemptsStore((state) => state.attemptsBySlot)
  const [job, setJob] = useState<ExpandJob | null>(null)
  const [activeJobId, setActiveJobId] = useState(jobId)
  const [stageProgress, setStageProgress] = useState<StageProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [, setStorageVersion] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)
  const startedInitialRef = useRef(false)
  const mountedRef = useRef(true)

  const refreshJob = useCallback(async (targetJobId: string): Promise<ExpandJob | null> => {
    if (!isProductionMode) return null
    try {
      const response = await fetch(
        `/api/compile/expand-job?jobId=${encodeURIComponent(targetJobId)}`,
      )
      if (!response.ok) {
        if (response.status === 404) setError('批量任务不存在或已被清理')
        return null
      }
      const body = (await response.json()) as { job?: ExpandJob }
      if (!body.job) return null
      setJob(body.job)
      return body.job
    } catch {
      setError('无法读取批量任务状态，请稍后重试')
      return null
    }
  }, [])

  const hydrateCompletedItem = useCallback(async (item: ExpandJobItem, topicId?: string) => {
    if (!isProductionMode) return
    if (!item.moduleId) return
    if (!mountedRef.current) return
    const repository = getStorage()
    const storedModule = await readServerValue<Module>(StorageKeys.module(item.moduleId))
    if (!mountedRef.current || !storedModule) return
    repository.set(StorageKeys.module(storedModule.id), storedModule)
    if (!mountedRef.current) return
    const source = await readServerValue<unknown>(StorageKeys.source(storedModule.sourceId))
    if (source !== null) repository.set(StorageKeys.source(storedModule.sourceId), source)
    if (topicId) addModuleToTopic(repository, topicId, storedModule.id)
  }, [])

  const hydrateCompletedItems = useCallback(
    async (nextJob: ExpandJob) => {
      await Promise.all(
        nextJob.items
          .filter((item) => item.status === 'done')
          .map((item) => hydrateCompletedItem(item, nextJob.topicId)),
      )
      setStorageVersion((version) => version + 1)
    },
    [hydrateCompletedItem],
  )

  const handleEvent = useCallback(
    (event: CompileEvent, request: TopicExpandRequest) => {
      if (event.kind === 'topic_expand_started') {
        setActiveJobId(event.jobId)
        setJob((current) => current ?? createOptimisticJob(request, event.jobId))
        window.history.replaceState(
          null,
          '',
          `/learn/expand-job?jobId=${encodeURIComponent(event.jobId)}`,
        )
        void refreshJob(event.jobId)
        return
      }

      if (event.kind === 'stage_enter') {
        setStageProgress({ stage: event.stage, percent: 0 })
        return
      }
      if (event.kind === 'progress') {
        setStageProgress({ stage: event.stage, percent: event.percent, message: event.message })
        return
      }
      if (event.kind === 'complete' || event.kind === 'error') return

      setJob((current) => {
        if (!current || current.jobId !== event.jobId) return current
        if (event.kind === 'item_started') {
          const index = findItemIndex(current, event.itemId, event.moduleIndex)
          const withRealId = replaceItemId(current, index, event.itemId)
          if (index < 0) return current
          return {
            ...withRealId,
            currentItemId: event.itemId,
            items: withRealId.items.map((item, itemIndex) =>
              itemIndex === index ? { ...item, status: 'running', updatedAt: Date.now() } : item,
            ),
            status: 'running',
            updatedAt: Date.now(),
          }
        }
        if (event.kind === 'item_completed') {
          const index = findItemIndex(current, event.itemId)
          if (index < 0) return current
          return {
            ...current,
            currentItemId: null,
            items: current.items.map((item, itemIndex) =>
              itemIndex === index
                ? { ...item, status: 'done', moduleId: event.moduleId, updatedAt: Date.now() }
                : item,
            ),
            updatedAt: Date.now(),
          }
        }
        if (event.kind === 'item_failed') {
          const index = findItemIndex(current, event.itemId)
          if (index < 0) return current
          return {
            ...current,
            currentItemId: null,
            status: 'failed',
            items: current.items.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    status: 'failed',
                    error: {
                      code: event.error.code ?? 'unknown',
                      message: event.error.message,
                      retryable: event.retryable,
                    },
                    updatedAt: Date.now(),
                  }
                : item,
            ),
            updatedAt: Date.now(),
          }
        }
        if (event.kind === 'topic_expand_paused') return { ...current, status: 'paused' }
        if (event.kind === 'topic_expand_cancelled') return { ...current, status: 'cancelled' }
        if (event.kind === 'topic_expand_completed') return { ...current, status: 'completed' }
        return current
      })

      if (event.kind === 'item_completed') {
        void refreshJob(event.jobId).then((nextJob) => {
          if (nextJob) void hydrateCompletedItems(nextJob)
        })
      } else if (
        event.kind === 'item_failed' ||
        event.kind === 'topic_expand_paused' ||
        event.kind === 'topic_expand_cancelled' ||
        event.kind === 'topic_expand_completed'
      ) {
        void refreshJob(event.jobId)
      }
    },
    [hydrateCompletedItems, refreshJob],
  )

  const startStream = useCallback(
    async (request: TopicExpandRequest, targetJobId?: string) => {
      if (!isProductionMode) return
      if (!config) {
        setError('需要先配置 LLM 供应商')
        return
      }
      if (controllerRef.current) return
      const controller = new AbortController()
      controllerRef.current = controller
      setError(null)
      const body: Record<string, unknown> = {
        compileMode: 'topic-expand',
        topicId: request.topicId,
        sourceHash: request.sourceHash,
        constraints: request.constraints,
        items: request.items.map((source, moduleIndex) => ({ source, moduleIndex })),
        config: {
          compileModel: config.model,
          lightweightModel: config.model,
          llm: config,
        },
      }
      if (targetJobId) {
        body.jobId = targetJobId
        const currentJob = job
        if (currentJob) {
          body.items = currentJob.items.map((item) => ({
            itemId: item.itemId,
            moduleIndex: item.moduleIndex,
            source: item.source,
          }))
        }
      }

      try {
        const response = await fetch('/api/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(detail?.error ?? `批量任务启动失败（HTTP ${response.status}）`)
        }
        const reader = response.body?.getReader()
        if (!reader) throw new Error('无法读取批量任务 SSE')
        const decoder = new TextDecoder()
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const events = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n')
          buffer = events.pop() ?? ''
          for (const rawEvent of events) {
            const event = parseSSE(rawEvent)
            if (event) handleEvent(event, request)
          }
        }
        const finalEvent = parseSSE(buffer)
        if (finalEvent) handleEvent(finalEvent, request)
        const completedJobId = targetJobId ?? activeJobId
        if (completedJobId) {
          const nextJob = await refreshJob(completedJobId)
          if (nextJob) await hydrateCompletedItems(nextJob)
        }
      } catch (streamError: unknown) {
        if (streamError instanceof Error && streamError.name === 'AbortError') return
        setError(streamError instanceof Error ? streamError.message : '批量任务连接失败')
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null
      }
    },
    [activeJobId, config, handleEvent, hydrateCompletedItems, job, refreshJob],
  )

  const waitForStreamIdle = useCallback(async (): Promise<void> => {
    const deadline = Date.now() + 30_000
    while (controllerRef.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    if (controllerRef.current) {
      throw new Error('上一批量任务连接尚未结束，请稍后重试')
    }
  }, [])

  useEffect(() => {
    if (!isProductionMode) return
    setReady(true)
    if (jobId) {
      setActiveJobId(jobId)
      void refreshJob(jobId).then((nextJob) => {
        if (nextJob) void hydrateCompletedItems(nextJob)
      })
    }
  }, [hydrateCompletedItems, jobId, refreshJob])

  useEffect(() => {
    if (!isProductionMode) return
    if (!ready || jobId || !initialRequest || startedInitialRef.current) return
    startedInitialRef.current = true
    void startStream(initialRequest)
  }, [initialRequest, jobId, ready, startStream])

  useEffect(
    () => () => {
      mountedRef.current = false
      controllerRef.current?.abort()
    },
    [],
  )

  const request = useMemo(() => (job ? requestFromJob(job) : initialRequest), [initialRequest, job])

  const postAction = useCallback(
    async (action: 'pause' | 'resume' | 'retry', itemId?: string) => {
      if (!activeJobId) return
      setBusyAction(itemId ? `${action}:${itemId}` : action)
      setError(null)
      try {
        const response = await fetch('/api/compile/expand-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: activeJobId, action, ...(itemId ? { itemId } : {}) }),
        })
        const body = (await response.json().catch(() => null)) as {
          error?: string
          job?: ExpandJob
        } | null
        if (!response.ok || !body?.job) throw new Error(body?.error ?? '批量任务操作失败')
        setJob(body.job)
        if (action === 'resume' || action === 'retry') {
          const nextRequest = requestFromJob(body.job) ?? request
          if (nextRequest) {
            await waitForStreamIdle()
            await startStream(nextRequest, body.job.jobId)
          }
        }
      } catch (actionError: unknown) {
        setError(actionError instanceof Error ? actionError.message : '批量任务操作失败')
      } finally {
        setBusyAction(null)
      }
    },
    [activeJobId, request, startStream, waitForStreamIdle],
  )

  const handleCancel = useCallback(async () => {
    if (!activeJobId) return
    setBusyAction('cancel')
    setError(null)
    try {
      const response = await fetch('/api/compile/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: activeJobId }),
      })
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(body?.error ?? '取消批量任务失败')
      await refreshJob(activeJobId)
    } catch (cancelError: unknown) {
      setError(cancelError instanceof Error ? cancelError.message : '取消批量任务失败')
    } finally {
      setBusyAction(null)
    }
  }, [activeJobId, refreshJob])

  const handleEnterModule = useCallback(
    (moduleId: string) => {
      if (!enterModule({ moduleId, allowResume: true })) {
        setError('Module 尚未同步到本地，请刷新后重试')
        return
      }
      router.push(`/learn/module/${moduleId}`)
    },
    [router],
  )

  if (!isProductionMode || !storage) return null

  const totalItems = job?.items.length ?? initialRequest?.items.length ?? 0
  const completedItems = job?.items.filter((item) => item.status === 'done').length ?? 0
  const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

  return (
    <main className="alc-page p-6">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="alc-label uppercase tracking-wider">Topic expand</p>
            <h1 className="mt-1 text-2xl font-semibold text-fg-primary">批量扩充学习主题</h1>
            <p className="mt-1 text-sm text-fg-secondary">
              每个主题独立生成并保存 Module；失败项不会删除已完成内容。
            </p>
          </div>
          <button
            type="button"
            className="alc-button-secondary text-xs"
            onClick={() => router.push('/learn/import')}
          >
            返回导入
          </button>
        </div>

        {job && (
          <section className="alc-card p-5 space-y-4" aria-label="批量任务进度">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-fg-primary font-medium">任务进度</p>
                <p className="mt-1 text-xs text-fg-tertiary">
                  {completedItems}/{totalItems} 个 Module 已完成 · {JOB_STATUS_LABELS[job.status]}
                </p>
              </div>
              <span className="text-lg tabular-nums text-accent-primary">{percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-elevated">
              <div
                className="h-full rounded-full bg-accent-primary transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
            {stageProgress && job.status === 'running' && (
              <p className="text-xs text-fg-secondary">
                当前阶段：{STAGE_LABELS[stageProgress.stage]} {stageProgress.percent}%
                {stageProgress.message ? ` · ${stageProgress.message}` : ''}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {job.status === 'running' && (
                <button
                  type="button"
                  className="alc-button-secondary text-xs"
                  onClick={() => void postAction('pause')}
                  disabled={busyAction !== null}
                >
                  暂停
                </button>
              )}
              {job.status === 'paused' && (
                <button
                  type="button"
                  className="alc-button-primary text-xs"
                  onClick={() => void postAction('resume')}
                  disabled={busyAction !== null}
                >
                  恢复
                </button>
              )}
              {job.status === 'created' ||
              job.status === 'running' ||
              job.status === 'paused' ||
              job.status === 'failed' ? (
                <button
                  type="button"
                  className="alc-button-danger text-xs"
                  onClick={() => void handleCancel()}
                  disabled={busyAction !== null}
                >
                  取消任务
                </button>
              ) : null}
            </div>
          </section>
        )}

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        {!job && <div className="alc-card p-5 text-sm text-fg-secondary">正在准备批量任务…</div>}

        {job && (
          <section className="space-y-3" aria-label="批量任务明细">
            {job.items.map((item) => {
              const storedModule = item.moduleId ? loadStoredModule(storage, item.moduleId) : null
              const progress = storedModule
                ? computeModuleProgress(
                    storedModule,
                    storage.get<ProgressState>(StorageKeys.progress(storedModule.id)),
                    attemptsBySlot,
                  )
                : null
              return (
                <article key={item.itemId} className="alc-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-fg-tertiary">Module {item.moduleIndex + 1}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg-primary">
                        {item.source}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs ${statusClass(item.status)}`}>
                      {ITEM_STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-tertiary">
                    <span>尝试 {item.attempts} 次</span>
                    {progress && (
                      <span>
                        {progress.label} · {progress.conceptPercent}%
                      </span>
                    )}
                  </div>
                  {item.status === 'failed' && item.attempts >= 3 && (
                    <p
                      className={`rounded-md p-2 text-xs ${
                        item.attempts >= 5
                          ? 'bg-danger/10 text-danger'
                          : 'bg-warning-soft text-warning border border-warning/40'
                      }`}
                      role="note"
                    >
                      {item.attempts >= 5
                        ? `已尝试 ${item.attempts} 次仍失败，强烈建议编辑源 Markdown 后重新提交；或确认 provider 配置正常。`
                        : `已尝试 ${item.attempts} 次，建议检查源 Markdown 与约束文本。`}
                    </p>
                  )}
                  {item.error && (
                    <p className="rounded-md bg-danger/10 p-2 text-xs text-danger" role="alert">
                      [{item.error.code}] {item.error.message}
                      {!item.error.retryable && '（该错误不可自动重试）'}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {item.status === 'failed' && item.error?.retryable && (
                      <button
                        type="button"
                        className="alc-button-secondary text-xs"
                        onClick={() => void postAction('retry', item.itemId)}
                        disabled={busyAction !== null}
                      >
                        {busyAction === `retry:${item.itemId}` ? '重试中…' : '重试此项'}
                      </button>
                    )}
                    {item.status === 'done' && item.moduleId && (
                      <button
                        type="button"
                        className="alc-button-primary text-xs"
                        onClick={() => handleEnterModule(item.moduleId!)}
                      >
                        进入学习
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </div>
    </main>
  )
}
