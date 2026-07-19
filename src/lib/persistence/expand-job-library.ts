/**
 * V2.1.0 P1：Topic 批量扩充任务 repository。
 *
 * 所有读写均经过 StorageRepository。showcase 模式返回 transient 结果但不落盘，
 * 因而不会把 production 批量任务状态混入静态展示数据。
 */

import { nanoid } from 'nanoid'

import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { StorageKeys } from './shared/keys'
import type { StorageRepository } from './shared/repository'
import { getStorage } from './client/storage'
import type {
  ExpandJob,
  ExpandJobCheckpoint,
  ExpandJobError,
  ExpandJobItem,
  ExpandJobItemStatus,
  ExpandJobStatus,
} from '@/types/expand-job'

const INDEX_KEY = StorageKeys.expandJob('__index__')

type Repository = StorageRepository

function repository(repo?: Repository): Repository {
  return repo ?? getStorage()
}

function canPersist(): boolean {
  return !isShowcaseMode
}

function readIndex(repo: Repository): string[] {
  return repo.get<string[]>(INDEX_KEY) ?? []
}

function writeIndex(repo: Repository, jobIds: string[]): void {
  repo.set(INDEX_KEY, [...new Set(jobIds)])
}

function checkpointFromItem(jobId: string, item: ExpandJobItem): ExpandJobCheckpoint {
  return {
    jobId,
    itemId: item.itemId,
    status: item.status,
    sourceHash: item.sourceHash,
    attempts: item.attempts,
    ...(item.moduleId !== undefined ? { moduleId: item.moduleId } : {}),
    ...(item.error !== undefined ? { error: item.error } : {}),
    updatedAt: item.updatedAt,
  }
}

function itemFromCheckpoint(item: ExpandJobItem, checkpoint: ExpandJobCheckpoint): ExpandJobItem {
  return {
    ...item,
    status: checkpoint.status,
    attempts: checkpoint.attempts,
    ...(checkpoint.moduleId !== undefined ? { moduleId: checkpoint.moduleId } : {}),
    ...(checkpoint.error !== undefined ? { error: checkpoint.error } : {}),
    updatedAt: checkpoint.updatedAt,
  }
}

function hydrateJob(repo: Repository, job: ExpandJob): ExpandJob {
  const items = job.items.map((item) => {
    const checkpoint = repo.get<ExpandJobCheckpoint>(
      StorageKeys.expandJobCheckpoint(job.jobId, item.itemId),
    )
    return checkpoint ? itemFromCheckpoint(item, checkpoint) : item
  })
  return { ...job, items }
}

function writeJob(repo: Repository, job: ExpandJob): void {
  repo.set(StorageKeys.expandJob(job.jobId), job)
  for (const item of job.items) {
    repo.set(
      StorageKeys.expandJobCheckpoint(job.jobId, item.itemId),
      checkpointFromItem(job.jobId, item),
    )
  }
  writeIndex(repo, [...readIndex(repo), job.jobId])
}

const allowedTransitions: Readonly<Record<ExpandJobStatus, readonly ExpandJobStatus[]>> = {
  created: ['running', 'cancelled'],
  running: ['paused', 'failed', 'completed', 'cancelled'],
  paused: ['running', 'cancelled'],
  failed: ['running', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
}

function isAllowedTransition(from: ExpandJobStatus, to: ExpandJobStatus): boolean {
  return allowedTransitions[from].includes(to)
}

const allowedItemTransitions: Readonly<
  Record<ExpandJobItemStatus, readonly ExpandJobItemStatus[]>
> = {
  queued: ['queued', 'running', 'cancelled'],
  running: ['running', 'done', 'failed', 'cancelled'],
  done: ['done'],
  failed: ['failed', 'queued', 'running', 'cancelled'],
  cancelled: ['cancelled'],
}

export function createExpandJob(
  args: {
    sourceHash: string
    topicId?: string
    constraints?: string
    items: Array<{
      itemId?: string
      moduleIndex: number
      source: string
      sourceHash?: string
    }>
  },
  repo?: Repository,
): ExpandJob {
  const now = Date.now()
  const items: ExpandJobItem[] = args.items.map((item, index) => ({
    itemId: item.itemId ?? `expand-item-${nanoid()}`,
    moduleIndex: item.moduleIndex ?? index,
    ...(args.topicId !== undefined ? { topicId: args.topicId } : {}),
    source: item.source,
    sourceHash: item.sourceHash ?? args.sourceHash,
    status: 'queued',
    attempts: 0,
    updatedAt: now,
  }))
  const job: ExpandJob = {
    jobId: `expand-job-${nanoid()}`,
    ...(args.topicId !== undefined ? { topicId: args.topicId } : {}),
    ...(args.constraints !== undefined ? { constraints: args.constraints } : {}),
    sourceHash: args.sourceHash,
    itemIds: items.map((item) => item.itemId),
    items,
    currentItemId: items[0]?.itemId ?? null,
    status: 'created',
    createdAt: now,
    updatedAt: now,
  }

  if (canPersist()) writeJob(repository(repo), job)
  return job
}

export function getExpandJob(jobId: string, repo?: Repository): ExpandJob | null {
  if (!canPersist()) return null
  const target = repository(repo)
  const job = target.get<ExpandJob>(StorageKeys.expandJob(jobId))
  return job ? hydrateJob(target, job) : null
}

export function listExpandJobs(repo?: Repository): ExpandJob[] {
  if (!canPersist()) return []
  const target = repository(repo)
  return readIndex(target)
    .map((jobId) => getExpandJob(jobId, target))
    .filter((job): job is ExpandJob => job !== null)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function updateExpandJob(
  jobId: string,
  patch: { status?: ExpandJobStatus; currentItemId?: string | null },
  repo?: Repository,
): ExpandJob | null {
  const current = getExpandJob(jobId, repo)
  if (!current) return null
  if (patch.status && !isAllowedTransition(current.status, patch.status)) return current
  const next: ExpandJob = {
    ...current,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.currentItemId !== undefined ? { currentItemId: patch.currentItemId } : {}),
    updatedAt: Date.now(),
  }
  repository(repo).set(StorageKeys.expandJob(jobId), next)
  return next
}

export function updateExpandJobItem(
  jobId: string,
  itemId: string,
  patch: {
    status?: ExpandJobItemStatus
    attempts?: number
    moduleId?: string
    error?: ExpandJobError | null
  },
  repo?: Repository,
): ExpandJob | null {
  const current = getExpandJob(jobId, repo)
  if (!current) return null
  const itemIndex = current.items.findIndex((item) => item.itemId === itemId)
  if (itemIndex < 0) return null

  const now = Date.now()
  const currentItem = current.items[itemIndex]!
  if (patch.status && !allowedItemTransitions[currentItem.status].includes(patch.status)) {
    return current
  }
  const nextItem: ExpandJobItem = {
    ...currentItem,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
    ...(patch.moduleId !== undefined ? { moduleId: patch.moduleId } : {}),
    updatedAt: now,
  }
  if (patch.error === null) {
    delete nextItem.error
  } else if (patch.error !== undefined) {
    nextItem.error = patch.error
  }
  const next: ExpandJob = {
    ...current,
    items: current.items.map((item, index) => (index === itemIndex ? nextItem : item)),
    itemIds: current.itemIds,
    updatedAt: now,
  }
  const target = repository(repo)
  target.set(StorageKeys.expandJob(jobId), next)
  target.set(StorageKeys.expandJobCheckpoint(jobId, itemId), checkpointFromItem(jobId, nextItem))
  return next
}

export function getExpandJobCheckpoint(
  jobId: string,
  itemId: string,
  repo?: Repository,
): ExpandJobCheckpoint | null {
  if (!canPersist()) return null
  return repository(repo).get<ExpandJobCheckpoint>(StorageKeys.expandJobCheckpoint(jobId, itemId))
}

export function listExpandJobCheckpoints(jobId: string, repo?: Repository): ExpandJobCheckpoint[] {
  const job = getExpandJob(jobId, repo)
  if (!job) return []
  const target = repository(repo)
  return job.itemIds
    .map((itemId) =>
      target.get<ExpandJobCheckpoint>(StorageKeys.expandJobCheckpoint(jobId, itemId)),
    )
    .filter((checkpoint): checkpoint is ExpandJobCheckpoint => checkpoint !== null)
}

export function clearExpandJob(jobId: string, repo?: Repository): void {
  if (!canPersist()) return
  const target = repository(repo)
  target.remove(StorageKeys.expandJob(jobId))
  const checkpointPrefix = StorageKeys.expandJobCheckpoint(jobId, '')
  for (const key of target.keys()) {
    if (key.startsWith(checkpointPrefix)) target.remove(key)
  }
  writeIndex(
    target,
    readIndex(target).filter((id) => id !== jobId),
  )
}

export function clearCompletedExpandJobs(repo?: Repository): void {
  for (const job of listExpandJobs(repo)) {
    if (job.status === 'completed' || job.status === 'cancelled') clearExpandJob(job.jobId, repo)
  }
}

export const expandJobLibrary = {
  create: createExpandJob,
  get: getExpandJob,
  list: listExpandJobs,
  update: updateExpandJob,
  updateItem: updateExpandJobItem,
  getCheckpoint: getExpandJobCheckpoint,
  listCheckpoints: listExpandJobCheckpoints,
  clear: clearExpandJob,
  clearCompleted: clearCompletedExpandJobs,
} as const
