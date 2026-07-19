/**
 * P1.2 Topic 批量扩充 pipeline。
 *
 * Module 是最小串行单元：每个 item 都独立调用 compileWithExpand，完成后
 * 先写入 Module/source，再写入 ExpandJob checkpoint。job 状态只在 item 边界
 * 读取，因此 pause/cancel 不会中断正在进行的 provider 请求。
 */
import type { CompileQualityReport } from '@/lib/compiler/quality/quality-report'
import { expandJobLibrary } from '@/lib/persistence/expand-job-library'
import { assignLocalModuleIdentity } from '@/lib/persistence/module-package'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import type { StorageRepository } from '@/lib/persistence/shared/repository'
import type { KnowledgeSource, Module } from '@/types/domain'
import type { ExpandJob, ExpandJobItem, ExpandJobItemStatus } from '@/types/expand-job'

import { compileWithExpand } from './compile-with-expand'
import { translateError } from './errors'
import type { CompileConfig, CompileErrorPayload, CompileEvent } from './types'

type ExpandJobLibrary = Pick<typeof expandJobLibrary, 'get' | 'update' | 'updateItem'>

export interface TopicExpandPipelineOptions {
  jobId: string
  sourceHash: string
  constraints?: string
  repository?: StorageRepository
  jobLibrary?: ExpandJobLibrary
  compileItem?: (
    source: string,
    constraints: string | undefined,
    config: CompileConfig,
    item: ExpandJobItem,
  ) => AsyncIterable<CompileEvent>
  writeModule?: (
    module: Module,
    item: ExpandJobItem,
    qualityReport: CompileQualityReport | undefined,
    repository: StorageRepository | undefined,
  ) => Module | void | Promise<Module | void>
}

export interface ExpandJobCounts {
  completedItems: number
  cancelledItems: number
}

export interface ExpandJobCancellationPlan {
  alreadyTerminal: boolean
  itemIdsToCancel: string[]
}

const TERMINAL_JOB_STATUSES = new Set<ExpandJob['status']>(['completed', 'cancelled'])

/** 供 route 与测试共用的恢复校验，避免恢复协议只存在于 HTTP 层。 */
export function validateTopicExpandSourceHash(job: ExpandJob, sourceHash: string): boolean {
  return job.sourceHash === sourceHash
}

/** 恢复时只运行尚未完成的 item；done item 永远不会重复插入 Module。 */
export function getTopicExpandRunnableItems(job: ExpandJob): ExpandJobItem[] {
  return job.items.filter((item) => item.status !== 'done')
}

/**
 * 取消计划：保留 running item 给 in-flight provider 请求收尾，queued/failed
 * item 在同一同步边界标记为 cancelled。这个纯函数也是 cancel API 的协议核心。
 */
export function planTopicExpandCancellation(job: ExpandJob): ExpandJobCancellationPlan {
  if (TERMINAL_JOB_STATUSES.has(job.status)) {
    return { alreadyTerminal: true, itemIdsToCancel: [] }
  }
  return {
    alreadyTerminal: false,
    itemIdsToCancel: job.items
      .filter((item) => item.status !== 'done' && item.status !== 'running')
      .map((item) => item.itemId),
  }
}

export function countTopicExpandItems(job: ExpandJob): ExpandJobCounts {
  return {
    completedItems: job.items.filter((item) => item.status === 'done').length,
    cancelledItems: job.items.filter((item) => item.status === 'cancelled').length,
  }
}

function persistCompletedModule(
  module: Module,
  item: ExpandJobItem,
  qualityReport: CompileQualityReport | undefined,
  repository: StorageRepository | undefined,
): Module {
  if (!repository) return module

  const now = Date.now()
  const storedModule = assignLocalModuleIdentity(module)
  const source: KnowledgeSource = {
    id: storedModule.sourceId,
    type: 'markdown',
    content: item.source,
    createdAt: now,
  }
  repository.set(StorageKeys.source(source.id), source)
  repository.set(StorageKeys.module(storedModule.id), {
    ...storedModule,
    origin: 'user' as const,
    importedAt: now,
  })
  if (qualityReport) {
    repository.set(StorageKeys.qualityReport(storedModule.id), qualityReport)
  }
  return storedModule
}

function toItemError(error: CompileErrorPayload): CompileErrorPayload {
  return {
    ...error,
    retryable: error.retryable,
  }
}

function makeUnexpectedError(stage: 'expand' | 'unknown', error: unknown): CompileErrorPayload {
  return translateError(stage, error)
}

function countCompleted(job: ExpandJob): number {
  return job.items.filter((item) => item.status === 'done').length
}

function countCancelled(job: ExpandJob): number {
  return job.items.filter((item) => item.status === 'cancelled').length
}

function canStartItem(status: ExpandJobItemStatus): boolean {
  return status !== 'done' && status !== 'cancelled'
}

/**
 * 串行执行一个 ExpandJob。函数不创建 job，初始 job 由 API 通过 P1.1 library
 * 创建；因此 resume 与初次执行使用同一条可测试路径。
 */
export async function* compileTopicWithExpand(
  config: CompileConfig,
  options: TopicExpandPipelineOptions,
): AsyncGenerator<CompileEvent, void, unknown> {
  const library = options.jobLibrary ?? expandJobLibrary
  const job = library.get(options.jobId, options.repository)
  if (!job) {
    throw new Error(`ExpandJob 不存在：${options.jobId}`)
  }
  if (!validateTopicExpandSourceHash(job, options.sourceHash)) {
    throw new Error('source_changed')
  }

  yield {
    kind: 'topic_expand_started',
    jobId: job.jobId,
    totalItems: job.items.length,
  }

  if (job.status === 'completed') {
    yield {
      kind: 'topic_expand_completed',
      jobId: job.jobId,
      moduleIds: job.items.flatMap((item) => (item.moduleId ? [item.moduleId] : [])),
    }
    return
  }
  if (job.status === 'cancelled') {
    yield {
      kind: 'topic_expand_cancelled',
      jobId: job.jobId,
      completedItems: countCompleted(job),
      cancelledItems: countCancelled(job),
    }
    return
  }
  if (job.status === 'paused') {
    yield {
      kind: 'topic_expand_paused',
      jobId: job.jobId,
      completedItems: countCompleted(job),
    }
    return
  }

  library.update(options.jobId, { status: 'running' }, options.repository)
  const compile =
    options.compileItem ??
    ((source, constraints, itemConfig) =>
      compileWithExpand(source, constraints, itemConfig) as AsyncIterable<CompileEvent>)

  for (const item of getTopicExpandRunnableItems(job)) {
    const latest = library.get(options.jobId, options.repository)
    if (!latest) throw new Error(`ExpandJob 不存在：${options.jobId}`)

    if (latest.status === 'paused') {
      yield {
        kind: 'topic_expand_paused',
        jobId: latest.jobId,
        completedItems: countCompleted(latest),
      }
      return
    }
    if (latest.status === 'cancelled') {
      yield {
        kind: 'topic_expand_cancelled',
        jobId: latest.jobId,
        completedItems: countCompleted(latest),
        cancelledItems: countCancelled(latest),
      }
      return
    }

    const currentItem = latest.items.find((candidate) => candidate.itemId === item.itemId)
    if (!currentItem || currentItem.status === 'done') continue
    if (!canStartItem(currentItem.status)) continue

    const attempts = currentItem.attempts + 1
    library.update(options.jobId, { currentItemId: currentItem.itemId }, options.repository)
    library.updateItem(
      options.jobId,
      currentItem.itemId,
      { status: 'running', attempts, error: null },
      options.repository,
    )
    yield {
      kind: 'item_started',
      jobId: options.jobId,
      itemId: currentItem.itemId,
      moduleIndex: currentItem.moduleIndex,
    }

    let compiledModule: Module | undefined
    let qualityReport: CompileQualityReport | undefined
    let itemError: CompileErrorPayload | undefined
    try {
      for await (const event of compile(
        currentItem.source,
        options.constraints,
        config,
        currentItem,
      )) {
        if (event.kind === 'complete') {
          compiledModule = event.module
          qualityReport = event.qualityReport
        } else {
          if (event.kind === 'error') itemError = event.error
          yield event
        }
      }
    } catch (error: unknown) {
      itemError = makeUnexpectedError('expand', error)
    }

    if (itemError || !compiledModule) {
      const error = toItemError(
        itemError ??
          makeUnexpectedError(
            'unknown',
            new Error('批量 item 流提前结束：未收到 complete 或 error 事件'),
          ),
      )
      library.updateItem(
        options.jobId,
        currentItem.itemId,
        {
          status: 'failed',
          attempts,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          },
        },
        options.repository,
      )
      library.update(options.jobId, { status: 'failed' }, options.repository)
      yield {
        kind: 'item_failed',
        jobId: options.jobId,
        itemId: currentItem.itemId,
        error,
        retryable: error.retryable,
      }
      return
    }

    let persistedModuleId = compiledModule.id
    try {
      const persistedModule = await (options.writeModule ?? persistCompletedModule)(
        compiledModule,
        currentItem,
        qualityReport,
        options.repository,
      )
      persistedModuleId = persistedModule?.id ?? compiledModule.id
    } catch (error: unknown) {
      const translated = makeUnexpectedError('unknown', error)
      library.updateItem(
        options.jobId,
        currentItem.itemId,
        {
          status: 'failed',
          attempts,
          error: {
            code: translated.code,
            message: translated.message,
            retryable: translated.retryable,
          },
        },
        options.repository,
      )
      library.update(options.jobId, { status: 'failed' }, options.repository)
      yield {
        kind: 'item_failed',
        jobId: options.jobId,
        itemId: currentItem.itemId,
        error: translated,
        retryable: translated.retryable,
      }
      return
    }

    library.updateItem(
      options.jobId,
      currentItem.itemId,
      { status: 'done', attempts, moduleId: persistedModuleId, error: null },
      options.repository,
    )
    yield {
      kind: 'item_completed',
      jobId: options.jobId,
      itemId: currentItem.itemId,
      moduleId: persistedModuleId,
    }

    const afterItem = library.get(options.jobId, options.repository)
    if (!afterItem) throw new Error(`ExpandJob 不存在：${options.jobId}`)
    if (afterItem.status === 'paused') {
      yield {
        kind: 'topic_expand_paused',
        jobId: afterItem.jobId,
        completedItems: countCompleted(afterItem),
      }
      return
    }
    if (afterItem.status === 'cancelled') {
      yield {
        kind: 'topic_expand_cancelled',
        jobId: afterItem.jobId,
        completedItems: countCompleted(afterItem),
        cancelledItems: countCancelled(afterItem),
      }
      return
    }
  }

  const completed = library.get(options.jobId, options.repository)
  if (!completed) throw new Error(`ExpandJob 不存在：${options.jobId}`)
  const moduleIds = completed.items.flatMap((item) =>
    item.status === 'done' && item.moduleId ? [item.moduleId] : [],
  )
  if (moduleIds.length === completed.items.length) {
    library.update(options.jobId, { status: 'completed', currentItemId: null }, options.repository)
    yield { kind: 'topic_expand_completed', jobId: completed.jobId, moduleIds }
  }
}
