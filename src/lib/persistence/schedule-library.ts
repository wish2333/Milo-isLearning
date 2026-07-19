/**
 * SchedulingData 派生缓存 repository。
 *
 * Schedule 与 attempts 分开存储，任何时候都可以从 attempts 重建；本模块
 * 只负责存取，不负责 FSRS 计算。默认使用浏览器 storage 单例，也允许传入
 * StorageRepository 供测试、迁移及 production server cache 使用。
 */

import type { SchedulingData } from '@/types/domain'

import { getStorage } from './client/storage'
import { StorageKeys } from './shared/keys'
import type { StorageRepository } from './shared/repository'

const schedulePrefix = `${StorageKeys.schedule('').slice(0, -1)}:`

function repository(repo?: StorageRepository): StorageRepository {
  return repo ?? getStorage()
}

/** 读取单个槽位的调度缓存。损坏或缺失数据按不存在处理。 */
export function get(slotId: string, repo?: StorageRepository): SchedulingData | null {
  return repository(repo).get<SchedulingData>(StorageKeys.schedule(slotId))
}

/** 写入单个槽位的调度缓存。 */
export function set(slotId: string, data: SchedulingData, repo?: StorageRepository): void {
  repository(repo).set(StorageKeys.schedule(slotId), data)
}

/** 删除单个槽位的调度缓存。 */
export function remove(slotId: string, repo?: StorageRepository): void {
  repository(repo).remove(StorageKeys.schedule(slotId))
}

/** 列出某模块的所有调度缓存。 */
export function listByModule(moduleId: string, repo?: StorageRepository): SchedulingData[] {
  return listAll(repo).filter((schedule) => schedule.moduleId === moduleId)
}

/**
 * 列出 due <= date 的调度缓存。
 *
 * `timezone` 明确指定比较时区，避免把服务器的 process 时区带入 Today
 * 查询。ISO due 是绝对时间点，epoch 比较在任意服务器时区下结果一致；
 * timezone 仍会经过 Intl 校验，确保调用方传入的是浏览器支持的本地 IANA
 * 时区，而不会静默回退到服务器时区。无效 due 会被跳过。
 */
export function listDueBefore(
  date: Date,
  timezone: string,
  repo?: StorageRepository,
): SchedulingData[] {
  // Validate the caller-provided timezone explicitly. Due values are ISO
  // instants, so comparing epoch milliseconds is both local-timezone neutral
  // and correct across DST fall-back (wall-clock tuples can go backwards).
  if (!isValidTimezone(timezone) || !Number.isFinite(date.getTime())) return []
  const cutoff = date.getTime()
  return listAll(repo).filter((schedule) => {
    const dueTime = Date.parse(schedule.due)
    if (!Number.isFinite(dueTime)) return false
    return dueTime <= cutoff
  })
}

/** 列出全部调度缓存，按 slotId 稳定排序。 */
export function listAll(repo?: StorageRepository): SchedulingData[] {
  const target = repository(repo)
  return target
    .keys()
    .filter((key) => key.startsWith(schedulePrefix))
    .map((key) => target.get<SchedulingData>(key))
    .filter((schedule): schedule is SchedulingData => schedule !== null)
    .sort((a, b) => a.slotId.localeCompare(b.slotId))
}

/** 仅删除 schedule 命名空间；不影响 modules、attempts 或其他数据。 */
export function clearAll(repo?: StorageRepository): void {
  const target = repository(repo)
  for (const key of target.keys()) {
    if (key.startsWith(schedulePrefix)) target.remove(key)
  }
}

/** 面向调用方的命名空间对象，避免散落 storage/key 细节。 */
export const scheduleLibrary = {
  get,
  set,
  remove,
  listByModule,
  listDueBefore,
  listAll,
  clearAll,
} as const

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

export type { StorageRepository }
