/**
 * Compile Job Store — 编译任务状态持久化（M7.5 Task 4）
 *
 * 设计意图：
 *   - 用户在编译页刷新后，源文本不应丢失（M7.5 §Global Constraints）
 *   - M7.5 不做"按 stage 续编"（那是 M7.6），只做：保留源文本 + 显示恢复界面 + 允许重新开始
 *   - 不缓存 stage outputs；刷新后用源文本重新发起 /api/compile 请求
 *
 * 持久化策略：直接走 StorageRepository（LocalStorage），不用 Zustand persist
 * （compiling 页本身已经是 Zustand，但状态在刷新后无意义；这里只需 raw job 数据）。
 */

import { nanoid } from 'nanoid'

import { StorageKeys } from '@/lib/persistence/shared/keys'
import type { StorageRepository } from '@/lib/persistence/shared/repository'
import type { CompileStage } from '@/lib/compiler/pipeline/types'

// =================================================================
// 类型
// =================================================================

export interface CompileJob {
  jobId: string
  sourceContent: string
  configSummary: { provider: string; model: string }
  status: 'running' | 'complete' | 'error'
  stage: CompileStage | null
  percent: number
  sessionId: string | null
  moduleId?: string
  errorMessage?: string
  /** 编译模式：'markdown'(默认) 或 'expand'(AI 扩充) */
  compileMode?: 'markdown' | 'expand'
  /** expand 模式的主题词 */
  topic?: string
  /** expand 模式的可选约束 */
  constraints?: string
  createdAt: number
  updatedAt: number
}

// =================================================================
// Index：所有 compile job 的 id 列表（按 createdAt 升序）
// =================================================================

/** 索引 key：保存所有 jobId 的数组（按 createdAt 升序）。 */
const INDEX_KEY = `${StorageKeys.compileJob('__index__')}`

function readIndex(repo: StorageRepository): string[] {
  return repo.get<string[]>(INDEX_KEY) ?? []
}

function writeIndex(repo: StorageRepository, ids: string[]): void {
  repo.set(INDEX_KEY, ids)
}

function appendJobId(repo: StorageRepository, jobId: string, createdAt: number): void {
  const ids = readIndex(repo).filter((id) => id !== jobId)
  ids.push(jobId)
  // 保持按 createdAt 升序（同一个 job 内 createdAt 不变；新 job 追加到尾部）
  writeIndex(repo, ids)
  void createdAt
}

function removeJobId(repo: StorageRepository, jobId: string): void {
  const ids = readIndex(repo).filter((id) => id !== jobId)
  writeIndex(repo, ids)
}

// =================================================================
// CRUD
// =================================================================

/**
 * 创建新的 compile job。返回新 job 实例（已写入 repository）。
 */
export function createCompileJob(
  repo: StorageRepository,
  args: {
    sourceContent: string
    configSummary: { provider: string; model: string }
    sessionId?: string | null
    compileMode?: 'markdown' | 'expand'
    topic?: string
    constraints?: string
  },
): CompileJob {
  const now = Date.now()
  const job: CompileJob = {
    jobId: `job-${nanoid()}`,
    sourceContent: args.sourceContent,
    configSummary: args.configSummary,
    status: 'running',
    stage: null,
    percent: 0,
    sessionId: args.sessionId ?? null,
    compileMode: args.compileMode,
    topic: args.topic,
    constraints: args.constraints,
    createdAt: now,
    updatedAt: now,
  }
  repo.set(StorageKeys.compileJob(job.jobId), job)
  appendJobId(repo, job.jobId, now)
  return job
}

/**
 * 读取单个 job；不存在返回 null。
 */
export function getCompileJob(repo: StorageRepository, jobId: string): CompileJob | null {
  return repo.get<CompileJob>(StorageKeys.compileJob(jobId))
}

/**
 * 局部更新 job。返回更新后的 job；jobId 不存在时返回 null。
 *
 * 合并语义：patch 的字段覆盖现有字段；updatedAt 自动更新。
 */
export function updateCompileJob(
  repo: StorageRepository,
  jobId: string,
  patch: Partial<Omit<CompileJob, 'jobId' | 'sourceContent' | 'configSummary' | 'createdAt'>>,
): CompileJob | null {
  const current = getCompileJob(repo, jobId)
  if (!current) return null
  const next: CompileJob = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  }
  repo.set(StorageKeys.compileJob(jobId), next)
  return next
}

/**
 * 清除指定 job（同时从索引中移除）。
 */
export function clearCompileJob(repo: StorageRepository, jobId: string): void {
  repo.remove(StorageKeys.compileJob(jobId))
  removeJobId(repo, jobId)
}

/**
 * 读取最近一个 job（按 createdAt 降序取第一个）。无 job 时返回 null。
 *
 * 用于刷新恢复：URL 上没有 jobId 时，回退到最近一次。
 */
export function getLatestCompileJob(repo: StorageRepository): CompileJob | null {
  const ids = readIndex(repo)
  if (ids.length === 0) return null
  // 索引是升序，最后一个是最新的
  const lastId = ids[ids.length - 1]
  if (!lastId) return null
  return getCompileJob(repo, lastId)
}

/**
 * 清理所有 complete/error 状态的旧 job，只保留最新一个（任意状态）。
 *
 * 在用户从恢复界面明确放弃或重启后调用，避免堆积。
 */
export function pruneCompileJobs(repo: StorageRepository, keepJobId?: string): void {
  const ids = readIndex(repo)
  for (const id of ids) {
    if (id === keepJobId) continue
    const job = getCompileJob(repo, id)
    // 只清理已经结束的（complete/error），running 的留着让用户能恢复
    if (job && job.status !== 'running') {
      repo.remove(StorageKeys.compileJob(id))
    }
  }
  // 重建索引
  const remaining = ids.filter((id) => repo.has(StorageKeys.compileJob(id)))
  writeIndex(repo, remaining)
}
