import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/runtime/app-mode', () => ({ isShowcaseMode: false }))

import type { StorageRepository } from './shared/repository'
import {
  clearCompletedExpandJobs,
  clearExpandJob,
  createExpandJob,
  getExpandJob,
  getExpandJobCheckpoint,
  listExpandJobCheckpoints,
  listExpandJobs,
  updateExpandJob,
  updateExpandJobItem,
} from './expand-job-library'

class MemoryRepository implements StorageRepository {
  private readonly values = new Map<string, string>()

  get<T>(key: string): T | null {
    const raw = this.values.get(key)
    return raw === undefined ? null : (JSON.parse(raw) as T)
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

describe('expand-job-library', () => {
  let repo: MemoryRepository

  beforeEach(() => {
    repo = new MemoryRepository()
  })

  it('creates, lists and restores a job with queued checkpoints', () => {
    const job = createExpandJob(
      {
        sourceHash: 'topic-hash',
        topicId: 'topic-1',
        items: [
          { itemId: 'item-1', moduleIndex: 0, source: 'first' },
          { itemId: 'item-2', moduleIndex: 1, source: 'second' },
        ],
      },
      repo,
    )

    expect(job.status).toBe('created')
    expect(job.itemIds).toEqual(['item-1', 'item-2'])
    expect(listExpandJobs(repo).map((entry) => entry.jobId)).toEqual([job.jobId])
    expect(listExpandJobCheckpoints(job.jobId, repo)).toHaveLength(2)
    expect(getExpandJobCheckpoint(job.jobId, 'item-1', repo)?.status).toBe('queued')
  })

  it('updates item progress and persists a resumable checkpoint', () => {
    const job = createExpandJob(
      { sourceHash: 'hash', items: [{ itemId: 'item-1', moduleIndex: 0, source: 'source' }] },
      repo,
    )

    updateExpandJob(job.jobId, { status: 'running', currentItemId: 'item-1' }, repo)
    updateExpandJobItem(job.jobId, 'item-1', { status: 'running', attempts: 1 }, repo)
    updateExpandJobItem(job.jobId, 'item-1', { status: 'done', moduleId: 'module-1' }, repo)

    expect(getExpandJob(job.jobId, repo)?.items[0]).toMatchObject({
      status: 'done',
      attempts: 1,
      moduleId: 'module-1',
    })
    expect(getExpandJobCheckpoint(job.jobId, 'item-1', repo)).toMatchObject({
      status: 'done',
      moduleId: 'module-1',
    })
  })

  it('keeps failed item error and supports retry transition', () => {
    const job = createExpandJob(
      { sourceHash: 'hash', items: [{ itemId: 'item-1', moduleIndex: 0, source: 'source' }] },
      repo,
    )
    const error = { code: 'llm_network', message: 'timeout', retryable: true }

    updateExpandJobItem(job.jobId, 'item-1', { status: 'running', attempts: 1 }, repo)
    updateExpandJobItem(job.jobId, 'item-1', { status: 'failed', attempts: 2, error }, repo)
    expect(getExpandJob(job.jobId, repo)?.items[0]?.error).toEqual(error)
    updateExpandJobItem(job.jobId, 'item-1', { status: 'queued', error: null }, repo)
    expect(getExpandJob(job.jobId, repo)?.items[0]?.error).toBeUndefined()
    expect(updateExpandJob(job.jobId, { status: 'running' }, repo)?.status).toBe('running')
  })

  it('makes terminal cancellation and cleanup idempotent', () => {
    const job = createExpandJob(
      { sourceHash: 'hash', items: [{ itemId: 'item-1', moduleIndex: 0, source: 'source' }] },
      repo,
    )
    updateExpandJob(job.jobId, { status: 'cancelled' }, repo)
    expect(updateExpandJob(job.jobId, { status: 'cancelled' }, repo)?.status).toBe('cancelled')
    clearExpandJob(job.jobId, repo)
    clearExpandJob(job.jobId, repo)
    expect(getExpandJob(job.jobId, repo)).toBeNull()
    expect(listExpandJobs(repo)).toEqual([])
  })

  it('clears only completed and cancelled jobs', () => {
    const completed = createExpandJob(
      { sourceHash: 'a', items: [{ itemId: 'a-1', moduleIndex: 0, source: 'a' }] },
      repo,
    )
    const active = createExpandJob(
      { sourceHash: 'b', items: [{ itemId: 'b-1', moduleIndex: 0, source: 'b' }] },
      repo,
    )
    updateExpandJob(completed.jobId, { status: 'running' }, repo)
    updateExpandJob(completed.jobId, { status: 'completed' }, repo)
    clearCompletedExpandJobs(repo)
    expect(getExpandJob(completed.jobId, repo)).toBeNull()
    expect(getExpandJob(active.jobId, repo)).not.toBeNull()
  })

  it('does not persist jobs in showcase mode', async () => {
    vi.resetModules()
    vi.doMock('@/lib/runtime/app-mode', () => ({ isShowcaseMode: true }))
    const library = await import('./expand-job-library')
    const showcaseJob = library.createExpandJob(
      { sourceHash: 'showcase', items: [{ moduleIndex: 0, source: 'source' }] },
      repo,
    )

    expect(repo.keys()).toEqual([])
    expect(library.getExpandJob(showcaseJob.jobId, repo)).toBeNull()
    vi.doUnmock('@/lib/runtime/app-mode')
  })
})
