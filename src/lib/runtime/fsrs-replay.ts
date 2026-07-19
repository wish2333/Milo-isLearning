/**
 * 单个题目槽位的 FSRS 派生缓存重放。
 *
 * AttemptRecord 是唯一真值；SchedulingData 可随时由该函数重新构建。调用方必须
 * 传入当前题目与所属模块/概念，因为早期 AttemptRecord 可能没有这些上下文。
 */

import { generatorParameters } from 'ts-fsrs'

import type { AttemptRecord, Quiz, SchedulingData } from '@/types/domain'

import { DEFAULT_FSRS_PARAMETERS, applyRating, createSchedule, inferRating } from './fsrs'

export interface FsrsReplayConfig {
  requestRetention: number
  maximumInterval: number
}

export interface RebuildScheduleForSlotParams {
  slotId: string
  moduleId: string
  conceptId: string
  /** 当前题目由调用方提供，与 contentRevision 对应。 */
  quiz: Quiz
  attempts: AttemptRecord[]
  contentRevision: string
  configRevision: string
  fsrsConfig: FsrsReplayConfig
}

/**
 * 对一个槽位的完整历史作答重放 FSRS。相同 timestamp 的记录按 id 排序，确保
 * 在不同浏览器和存储读取顺序下得到相同的派生缓存。
 */
export function rebuildScheduleForSlot({
  slotId,
  moduleId,
  conceptId,
  quiz: _quiz,
  attempts,
  contentRevision,
  configRevision,
  fsrsConfig,
}: RebuildScheduleForSlotParams): SchedulingData | null {
  if (attempts.length === 0) return null

  const orderedAttempts = [...attempts].sort(compareAttempts)
  const parameters = createReplayParameters(fsrsConfig)
  let schedule = createSchedule(
    slotId,
    moduleId,
    conceptId,
    new Date(orderedAttempts[0]!.timestamp),
  )

  for (const attempt of orderedAttempts) {
    schedule = applyRating(schedule, inferRating(attempt), new Date(attempt.timestamp), parameters)
  }

  return {
    ...schedule,
    contentRevision,
    configRevision,
    lastAppliedAttemptId: orderedAttempts.at(-1)!.id,
  }
}

/**
 * generatorParameters 的默认值随依赖版本可能变化。重放时显式给出所有算法参数，
 * 只允许用户设置的 retention 与 interval 覆盖锁定默认值。
 */
function createReplayParameters(config: FsrsReplayConfig) {
  return generatorParameters({
    request_retention: config.requestRetention,
    maximum_interval: config.maximumInterval,
    w: [...DEFAULT_FSRS_PARAMETERS.w],
    enable_fuzz: DEFAULT_FSRS_PARAMETERS.enable_fuzz,
    enable_short_term: DEFAULT_FSRS_PARAMETERS.enable_short_term,
    learning_steps: [...DEFAULT_FSRS_PARAMETERS.learning_steps],
    relearning_steps: [...DEFAULT_FSRS_PARAMETERS.relearning_steps],
  })
}

function compareAttempts(left: AttemptRecord, right: AttemptRecord): number {
  if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}
