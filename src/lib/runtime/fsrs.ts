/**
 * ts-fsrs 5.4.1 (FSRS-6) 的领域适配层。
 *
 * 业务代码只处理 SchedulingData，不直接依赖 ts-fsrs Card/State 的数字枚举。
 * 该模块不读写 storage；重放及持久化由上层协调层负责。
 */

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRSParameters,
  type Grade,
} from 'ts-fsrs'

import type { AttemptRecord, SchedulingData } from '@/types/domain'

/**
 * 完整锁定的 FSRS-6 参数，避免 ts-fsrs 默认值漂移影响可重放结果。
 * request_retention / maximum_interval 是后续设置页可覆盖的两个参数。
 */
export const DEFAULT_FSRS_PARAMETERS: FSRSParameters = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 365,
  w: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
    0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
  ],
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
})

/** 从空卡创建一个带业务标识的调度缓存。 */
export function createSchedule(
  slotId: string,
  moduleId: string,
  conceptId: string,
  now: Date = new Date(),
): SchedulingData {
  return fromCard(slotId, moduleId, conceptId, createEmptyCard(now), {
    contentRevision: '',
    configRevision: '',
    lastAppliedAttemptId: '',
  })
}

/**
 * 将一次评分应用到调度状态。导出以便 replay 单测验证官方状态，业务调用方
 * 仍应优先使用 fsrs-replay 的全量重放入口。
 */
export function applyRating(
  previous: SchedulingData,
  rating: Grade,
  now: Date = new Date(),
  parameters: FSRSParameters = DEFAULT_FSRS_PARAMETERS,
): SchedulingData {
  const card = toCard(previous)
  const next = fsrs(parameters).next(card, now, rating)
  return fromCard(previous.slotId, previous.moduleId, previous.conceptId, next.card, {
    contentRevision: previous.contentRevision,
    configRevision: previous.configRevision,
    lastAppliedAttemptId: previous.lastAppliedAttemptId,
  })
}

/** 根据作答质量、蒙对标记及耗时映射 FSRS rating。 */
export function inferRating(attempt: AttemptRecord): Grade {
  if (attempt.score < 80) return Rating.Again
  if (attempt.guessed) return Rating.Hard
  if (attempt.timeSpentMs !== undefined && attempt.timeSpentMs < 5000) return Rating.Easy
  return Rating.Good
}

/**
 * 判断卡片是否到期。比较在给定 IANA 时区中进行，绝不读取服务器时区；
 * 由于两侧均为同一时区的本地表示，毫秒级比较仍使用原始 epoch 保证边界准确。
 */
export function isDue(schedule: SchedulingData, now: Date, timezone: string): boolean {
  const dueTime = Date.parse(schedule.due)
  if (!Number.isFinite(dueTime) || !Number.isFinite(now.getTime())) return false
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    // 触发时区校验并明确使用本地时区格式化；epoch 比较避免丢失毫秒精度。
    formatter.format(new Date(dueTime))
    formatter.format(now)
  } catch {
    return false
  }
  return dueTime <= now.getTime()
}

function toCard(schedule: SchedulingData): Card {
  return {
    due: new Date(schedule.due),
    stability: schedule.stability,
    difficulty: schedule.difficulty,
    elapsed_days: schedule.elapsed_days,
    scheduled_days: schedule.scheduled_days,
    learning_steps: schedule.learning_steps ?? 0,
    reps: schedule.reps,
    lapses: schedule.lapses,
    state: stateFromString(schedule.state),
    last_review: schedule.last_review === null ? undefined : new Date(schedule.last_review),
  }
}

function fromCard(
  slotId: string,
  moduleId: string,
  conceptId: string,
  card: Card,
  metadata: Pick<SchedulingData, 'contentRevision' | 'configRevision' | 'lastAppliedAttemptId'>,
): SchedulingData {
  return {
    slotId,
    moduleId,
    conceptId,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: stateToString(card.state),
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString() ?? null,
    schemaVersion: 1,
    contentRevision: metadata.contentRevision,
    configRevision: metadata.configRevision,
    lastAppliedAttemptId: metadata.lastAppliedAttemptId,
    learning_steps: card.learning_steps,
  }
}

function stateToString(state: State): SchedulingData['state'] {
  switch (state) {
    case State.New:
      return 'new'
    case State.Learning:
      return 'learning'
    case State.Review:
      return 'review'
    case State.Relearning:
      return 'relearning'
    default: {
      const exhaustive: never = state
      return exhaustive
    }
  }
}

function stateFromString(state: SchedulingData['state']): State {
  switch (state) {
    case 'new':
      return State.New
    case 'learning':
      return State.Learning
    case 'review':
      return State.Review
    case 'relearning':
      return State.Relearning
  }
}

export { Rating, State }
