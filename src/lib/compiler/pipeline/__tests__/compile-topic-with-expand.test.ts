import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/runtime/app-mode', () => ({ isShowcaseMode: false }))

import {
  compileTopicWithExpand,
  getTopicExpandRunnableItems,
  planTopicExpandCancellation,
  validateTopicExpandSourceHash,
} from '../compile-topic-with-expand'
import type { CompileConfig, CompileEvent, CompileErrorPayload } from '../types'
import {
  createExpandJob,
  expandJobLibrary,
  updateExpandJob,
  updateExpandJobItem,
} from '@/lib/persistence/expand-job-library'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import type { StorageRepository } from '@/lib/persistence/shared/repository'
import type { Module } from '@/types/domain'
import type { ExpandJob } from '@/types/expand-job'

type CompileItem = NonNullable<Parameters<typeof compileTopicWithExpand>[1]['compileItem']>
type WriteModule = NonNullable<Parameters<typeof compileTopicWithExpand>[1]['writeModule']>

class MemoryRepository implements StorageRepository {
  private readonly values = new Map<string, string>()

  get<T>(key: string): T | null {
    const value = this.values.get(key)
    return value === undefined ? null : (JSON.parse(value) as T)
  }
  set<T>(key: string, value: T): void {
    this.values.set(key, JSON.stringify(value))
  }
  remove(key: string): void {
    this.values.delete(key)
  }
  has(key: string): boolean {
    return this.values.has(key)
  }
  keys(): string[] {
    return [...this.values.keys()]
  }
  getRaw(key: string): string | null {
    return this.values.get(key) ?? null
  }
  setRaw(key: string, value: string): void {
    this.values.set(key, value)
  }
  clearAll(): void {
    this.values.clear()
  }
}

const config: CompileConfig = {
  compileModel: 'test-model',
  lightweightModel: 'test-model',
  llm: { provider: 'deepseek', apiKey: 'test-key', model: 'test-model' },
}

const errorPayload: CompileErrorPayload = {
  stage: 'expand',
  code: 'llm_network',
  message: 'provider unavailable',
  retryable: true,
}

function makeModule(id: string): Module {
  return {
    id,
    sourceId: `source-${id}`,
    title: id,
    intro: 'intro',
    goal: 'goal',
    concepts: [],
    feynmanTask: { moduleId: id, steps: [], finalPrompt: 'prompt', rubric: [] },
    order: 1,
  }
}

function createJob(repo: MemoryRepository, count = 2): ExpandJob {
  return createExpandJob(
    {
      sourceHash: 'topic-hash',
      items: Array.from({ length: count }, (_, index) => ({
        itemId: `item-${index + 1}`,
        moduleIndex: index,
        source: `source-${index + 1}`,
      })),
    },
    repo,
  )
}

async function collectEvents(
  configToUse: CompileConfig,
  options: Parameters<typeof compileTopicWithExpand>[1],
): Promise<CompileEvent[]> {
  const events: CompileEvent[] = []
  for await (const event of compileTopicWithExpand(configToUse, options)) {
    events.push(event)
  }
  return events
}

function fakeCompiler(
  mode: 'success' | 'fail',
  calls: string[],
): NonNullable<Parameters<typeof compileTopicWithExpand>[1]['compileItem']> {
  return async function* (_source, _constraints, _config, item) {
    calls.push(item.itemId)
    if (mode === 'fail') {
      yield { kind: 'error', error: errorPayload }
      return
    }
    yield { kind: 'stage_enter', stage: 'expand' }
    yield { kind: 'complete', module: makeModule(`module-${item.itemId}`) }
  }
}

describe('compileTopicWithExpand', () => {
  let repo: MemoryRepository

  beforeEach(() => {
    repo = new MemoryRepository()
  })

  it('串行完成所有 item，写入 checkpoint/module，并发出完成事件', async () => {
    const job = createJob(repo)
    const calls: string[] = []
    const events = await collectEvents(config, {
      jobId: job.jobId,
      sourceHash: 'topic-hash',
      repository: repo,
      compileItem: fakeCompiler('success', calls),
    })

    expect(calls).toEqual(['item-1', 'item-2'])
    expect(events.map((event) => event.kind)).toEqual([
      'topic_expand_started',
      'item_started',
      'stage_enter',
      'item_completed',
      'item_started',
      'stage_enter',
      'item_completed',
      'topic_expand_completed',
    ])
    expect(expandJobLibrary.get(job.jobId, repo)).toMatchObject({ status: 'completed' })
    expect(repo.get<Module>(StorageKeys.module('module-item-1'))?.origin).toBe('user')
    expect(repo.get<Module>(StorageKeys.module('module-item-2'))?.origin).toBe('user')
  })

  it('单 item 失败时保留已完成 Module 与 done checkpoint', async () => {
    const job = createJob(repo)
    const calls: string[] = []
    const compiler: NonNullable<Parameters<typeof compileTopicWithExpand>[1]['compileItem']> =
      async function* (_source, _constraints, _config, item) {
        calls.push(item.itemId)
        if (item.itemId === 'item-2') {
          yield { kind: 'error', error: errorPayload }
          return
        }
        yield { kind: 'complete', module: makeModule('module-item-1') }
      }

    const events = await collectEvents(config, {
      jobId: job.jobId,
      sourceHash: 'topic-hash',
      repository: repo,
      compileItem: compiler,
    })
    const restored = expandJobLibrary.get(job.jobId, repo)

    expect(calls).toEqual(['item-1', 'item-2'])
    expect(restored?.status).toBe('failed')
    expect(restored?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: 'item-1', status: 'done', moduleId: 'module-item-1' }),
        expect.objectContaining({ itemId: 'item-2', status: 'failed' }),
      ]),
    )
    expect(repo.get<Module>(StorageKeys.module('module-item-1'))).not.toBeNull()
    expect(events.some((event) => event.kind === 'item_failed')).toBe(true)
  })

  it('pause 在 item 边界生效，resume 只运行非 done item', async () => {
    const job = createJob(repo)
    const firstCalls: string[] = []
    const pauseAfterFirst = fakeCompiler('success', firstCalls)
    const originalWrite = async (
      module: Module,
      item: Parameters<NonNullable<Parameters<typeof compileTopicWithExpand>[1]['writeModule']>>[1],
      qualityReport: Parameters<
        NonNullable<Parameters<typeof compileTopicWithExpand>[1]['writeModule']>
      >[2],
      repository: StorageRepository | undefined,
    ): Promise<void> => {
      void module
      void item
      void qualityReport
      void repository
      if (firstCalls.length === 1) {
        updateExpandJob(job.jobId, { status: 'paused' }, repo)
      }
    }

    const pausedEvents = await collectEvents(config, {
      jobId: job.jobId,
      sourceHash: 'topic-hash',
      repository: repo,
      compileItem: pauseAfterFirst,
      writeModule: originalWrite,
    })
    expect(pausedEvents.some((event) => event.kind === 'topic_expand_paused')).toBe(true)
    expect(expandJobLibrary.get(job.jobId, repo)?.items[0]?.status).toBe('done')

    updateExpandJob(job.jobId, { status: 'running' }, repo)
    const resumeCalls: string[] = []
    await collectEvents(config, {
      jobId: job.jobId,
      sourceHash: 'topic-hash',
      repository: repo,
      compileItem: fakeCompiler('success', resumeCalls),
      writeModule: vi.fn(),
    })
    expect(resumeCalls).toEqual(['item-2'])
  })

  it('cancel 在边界停止后续 item，保留已完成 Module', async () => {
    const job = createJob(repo)
    const calls: string[] = []
    const compiler = fakeCompiler('success', calls)
    const cancelAfterFirst = async (
      module: Module,
      item: Parameters<NonNullable<Parameters<typeof compileTopicWithExpand>[1]['writeModule']>>[1],
      qualityReport: Parameters<
        NonNullable<Parameters<typeof compileTopicWithExpand>[1]['writeModule']>
      >[2],
      repository: StorageRepository | undefined,
    ): Promise<void> => {
      void module
      void item
      void qualityReport
      if (repository) repository.set(StorageKeys.module(module.id), module)
      if (calls.length === 1) {
        const current = expandJobLibrary.get(job.jobId, repo)
        if (current) {
          for (const itemToCancel of planTopicExpandCancellation(current).itemIdsToCancel) {
            updateExpandJobItem(job.jobId, itemToCancel, { status: 'cancelled' }, repo)
          }
          updateExpandJob(job.jobId, { status: 'cancelled' }, repo)
        }
      }
    }

    const events = await collectEvents(config, {
      jobId: job.jobId,
      sourceHash: 'topic-hash',
      repository: repo,
      compileItem: compiler,
      writeModule: cancelAfterFirst,
    })

    expect(calls).toEqual(['item-1'])
    expect(events.some((event) => event.kind === 'topic_expand_cancelled')).toBe(true)
    expect(repo.get<Module>(StorageKeys.module('module-item-1'))).not.toBeNull()
    expect(expandJobLibrary.get(job.jobId, repo)?.items[1]?.status).toBe('cancelled')
  })

  it('sourceHash 不一致时拒绝恢复，且纯取消计划保持幂等边界', async () => {
    const job = createJob(repo)
    expect(validateTopicExpandSourceHash(job, 'other-hash')).toBe(false)
    expect(getTopicExpandRunnableItems(job)).toHaveLength(2)
    expect(planTopicExpandCancellation(job)).toMatchObject({
      alreadyTerminal: false,
      itemIdsToCancel: ['item-1', 'item-2'],
    })

    await expect(
      collectEvents(config, {
        jobId: job.jobId,
        sourceHash: 'other-hash',
        repository: repo,
        compileItem: fakeCompiler('success', []),
      }),
    ).rejects.toThrow('source_changed')

    updateExpandJob(job.jobId, { status: 'cancelled' }, repo)
    expect(planTopicExpandCancellation(expandJobLibrary.get(job.jobId, repo)!)).toEqual({
      alreadyTerminal: true,
      itemIdsToCancel: [],
    })
  })

  it('7 个 Topic Expand SSE event 均可由统一 CompileEvent 联合承载', async () => {
    const emittedKinds = new Set<string>()
    const recordTopicKinds = (events: CompileEvent[]): void => {
      for (const event of events) {
        if (event.kind.startsWith('topic_') || event.kind.startsWith('item_')) {
          emittedKinds.add(event.kind)
        }
      }
    }

    const successRepo = new MemoryRepository()
    const successJob = createJob(successRepo, 1)
    recordTopicKinds(
      await collectEvents(config, {
        jobId: successJob.jobId,
        sourceHash: 'topic-hash',
        repository: successRepo,
        compileItem: fakeCompiler('success', []),
      }),
    )

    const failureRepo = new MemoryRepository()
    const failureJob = createJob(failureRepo, 1)
    recordTopicKinds(
      await collectEvents(config, {
        jobId: failureJob.jobId,
        sourceHash: 'topic-hash',
        repository: failureRepo,
        compileItem: fakeCompiler('fail', []),
      }),
    )

    const pauseRepo = new MemoryRepository()
    const pauseJob = createJob(pauseRepo, 1)
    const pauseCompiler: CompileItem = fakeCompiler('success', [])
    const pauseWriter: WriteModule = async (_module, _item, _qualityReport, _repository) => {
      updateExpandJob(pauseJob.jobId, { status: 'paused' }, pauseRepo)
    }
    recordTopicKinds(
      await collectEvents(config, {
        jobId: pauseJob.jobId,
        sourceHash: 'topic-hash',
        repository: pauseRepo,
        compileItem: pauseCompiler,
        writeModule: pauseWriter,
      }),
    )

    const cancelRepo = new MemoryRepository()
    const cancelJob = createJob(cancelRepo, 2)
    const cancelCompiler: CompileItem = fakeCompiler('success', [])
    const cancelWriter: WriteModule = async (_module, _item, _qualityReport, _repository) => {
      const current = expandJobLibrary.get(cancelJob.jobId, cancelRepo)
      if (!current) throw new Error('cancel test job missing')
      for (const itemId of planTopicExpandCancellation(current).itemIdsToCancel) {
        updateExpandJobItem(cancelJob.jobId, itemId, { status: 'cancelled' }, cancelRepo)
      }
      updateExpandJob(cancelJob.jobId, { status: 'cancelled' }, cancelRepo)
    }
    recordTopicKinds(
      await collectEvents(config, {
        jobId: cancelJob.jobId,
        sourceHash: 'topic-hash',
        repository: cancelRepo,
        compileItem: cancelCompiler,
        writeModule: cancelWriter,
      }),
    )

    expect(emittedKinds).toEqual(
      new Set([
        'topic_expand_started',
        'item_started',
        'item_completed',
        'item_failed',
        'topic_expand_paused',
        'topic_expand_cancelled',
        'topic_expand_completed',
      ]),
    )
  })
})
