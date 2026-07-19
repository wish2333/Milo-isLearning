/**
 * FSRS 调度协调层。
 *
 * AttemptRecord 是作答历史的唯一真值。本模块只在调用方已经完成 attempt mutation
 * 后，以显式的题目上下文全量重放并写入 SchedulingData 派生缓存。它刻意不从
 * originalQuizId 推导模块或概念，避免旧格式 slotId 造成错误归属。
 */

import type { AttemptRecord, Quiz } from '@/types/domain'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import type { StorageRepository } from '@/lib/persistence/shared/repository'
import { useSettingsStore } from '@/lib/state/settings-store'

import { computeConfigRevision, computeContentRevision } from './content-revision'
import { rebuildScheduleForSlot, type FsrsReplayConfig } from './fsrs-replay'

/** P1.8 设置页接入前使用的稳定默认参数。 */
export const DEFAULT_FSRS_REPLAY_CONFIG: FsrsReplayConfig = {
  requestRetention: 0.9,
  maximumInterval: 365,
}

export interface SynchronizeScheduleForSlotParams {
  slotId: string
  moduleId: string
  conceptId: string
  quiz: Quiz
  attempts: AttemptRecord[]
  fsrsConfig?: FsrsReplayConfig
  /** 仅供单测和迁移等非浏览器调用方注入 storage。 */
  repository?: StorageRepository
}

export type ScheduleSynchronizationResult = 'set' | 'removed' | 'failed'

/**
 * 从当前完整历史重建一个槽位的派生调度缓存。
 *
 * 调度失败不会影响已经落入 attempts-store 的作答记录，也不会阻止用户看到反馈。
 * 调用方可忽略返回值；这里仅记录诊断信息，后续全量回填可以补齐失败的缓存。
 */
export function synchronizeScheduleForSlot({
  slotId,
  moduleId,
  conceptId,
  quiz,
  attempts,
  fsrsConfig,
  repository,
}: SynchronizeScheduleForSlotParams): ScheduleSynchronizationResult {
  try {
    const effectiveConfig = fsrsConfig ?? readFsrsReplayConfig()
    const schedule = rebuildScheduleForSlot({
      slotId,
      moduleId,
      conceptId,
      quiz,
      attempts,
      contentRevision: computeContentRevision(quiz),
      configRevision: computeConfigRevision(effectiveConfig),
      fsrsConfig: effectiveConfig,
    })

    if (schedule === null) {
      scheduleLibrary.remove(slotId, repository)
      return 'removed'
    }

    scheduleLibrary.set(slotId, schedule, repository)
    return 'set'
  } catch (error) {
    // 派生缓存可由 AttemptRecord 重建，不能让它破坏既有答题体验。
    console.error('[fsrs] 同步调度缓存失败', error)
    return 'failed'
  }
}

function readFsrsReplayConfig(): FsrsReplayConfig {
  const configured = useSettingsStore.getState().fsrs
  if (!configured) return DEFAULT_FSRS_REPLAY_CONFIG
  return {
    requestRetention: configured.requestRetention,
    maximumInterval: configured.maximumInterval,
  }
}
