/**
 * 轻量学习统计。
 *
 * 统计只读取已经持久化的 Module、作答记录和 FSRS 调度缓存，不修改任何
 * 状态。日期边界统一按浏览器传入的 IANA 时区计算，避免 production
 * 服务端时区影响“今天”和趋势统计。
 *
 * 注意：SchedulingData 是当前状态缓存，不是 due 历史日志。因此趋势中的
 * due 数量只表示当前缓存的 due 时间落在该日的槽位；不会为了补造历史而
 * 写入统计快照。attempts 仍是作答统计的唯一数据源。
 */

import type { AttemptRecord, Module, SchedulingData, StudyStreak } from '@/types/domain'

export interface StatsInput {
  modules: Module[]
  attemptsBySlot: Record<string, AttemptRecord[]>
  schedules: SchedulingData[]
  streak?: StudyStreak | null
  now?: Date
  timezone?: string
}

/** 一个本地日历日的只读派生统计。 */
export interface StatsTrendDay {
  /** YYYY-MM-DD，本地时区日期。 */
  date: string
  /** 当日去重后的全部作答次数，包括重试。 */
  attemptCount: number
  /** 当日全部作答中达到 PASS_THRESHOLD 的次数。 */
  correctCount: number
  /** 当日全部作答正确率，范围 0–100。 */
  accuracy: number
  /** 当日各 slot 的最早唯一作答次数。 */
  firstAttemptCount: number
  /** 当日各 slot 的最早唯一作答中达到 PASS_THRESHOLD 的次数。 */
  firstCorrectCount: number
  /** 当日首答正确率，范围 0–100。 */
  firstCorrectRate: number
  /** 当前 schedule 的 due 时间落在当日的可见槽位数；今日还包含当前 overdue backlog。 */
  dueCount: number
  /** 上述 due 槽位在对应日期完成过至少一次作答的槽位数。 */
  dueCompletedCount: number
  /** dueCompletedCount / dueCount，范围 0–100；无 due 时为 0。 */
  dueCompletionRate: number
  /** 当日非 slot 首次作答的次数，包含重试/复习作答。 */
  reviewAttemptCount: number
  /** 当日 slot 最早作答的次数；这是可由现有数据稳定推导的“新题”口径。 */
  newAttemptCount: number
  /** 当日是否有至少一次有效作答。 */
  studyDay: boolean
}

export interface StatsSummary {
  /** 当前时刻已经到期、且属于当前题库的题目数。 */
  todayDueCount: number
  /** 今日对上述到期槽位至少作答过一次的题目数（按槽位去重）。 */
  todayCompletedCount: number
  currentStreak: number
  longestStreak: number
  /** 近 7 个本地日历日的正确率，范围 0–100。 */
  sevenDayAccuracy: number
  sevenDayCorrect: number
  sevenDayAttempts: number
  /** 近 7 个本地日历日，按日期从旧到新排列。 */
  sevenDayTrend: StatsTrendDay[]
  /** 近 30 个本地日历日，按日期从旧到新排列。 */
  thirtyDayTrend: StatsTrendDay[]
  /** 近 7/30 个本地日历日内有有效作答的日期数。 */
  sevenDayStudyDays: number
  thirtyDayStudyDays: number
  moduleCount: number
  totalAttempts: number
}

const PASS_THRESHOLD = 80

/** 计算 Today/Stats 页面所需的全部指标。 */
export function computeStats({
  modules,
  attemptsBySlot,
  schedules,
  streak = null,
  now = new Date(),
  timezone = browserTimezone(),
}: StatsInput): StatsSummary {
  const currentStreak = streak?.currentStreak ?? 0
  const longestStreak = streak?.longestStreak ?? 0
  const effectiveTimezone = isValidTimezone(timezone) ? timezone : 'UTC'
  const moduleIds = new Set(modules.map((module) => module.id))
  const activeQuizIds = new Set<string>()
  const ignoredQuizIds = new Set<string>()

  for (const storedModule of modules) {
    for (const concept of storedModule.concepts) {
      for (const quiz of concept.quizSeries.quizzes) {
        if (quiz.ignored) ignoredQuizIds.add(quiz.id)
        else activeQuizIds.add(quiz.id)
      }
    }
    for (const quiz of storedModule.challengeQuizzes ?? []) {
      if (quiz.ignored) ignoredQuizIds.add(quiz.id)
      else activeQuizIds.add(quiz.id)
    }
  }

  const today = localDateKey(now, effectiveTimezone)
  const dueSlotIds = new Set(
    visibleSchedules(schedules, moduleIds, activeQuizIds, ignoredQuizIds)
      .filter(
        (schedule) => isValidInstant(schedule.due) && Date.parse(schedule.due) <= now.getTime(),
      )
      .map((schedule) => schedule.slotId),
  )

  const visibleAttempts = collectVisibleAttempts(attemptsBySlot, activeQuizIds)
  const todayCompletedSlotIds = new Set<string>()
  for (const [slotId, attempts] of visibleAttempts) {
    if (!dueSlotIds.has(slotId)) continue
    if (
      attempts.some(
        (attempt) =>
          isAttemptAtOrBeforeNow(attempt, now) &&
          localDateKey(new Date(attemptEventTimestamp(attempt)), effectiveTimezone) === today,
      )
    ) {
      todayCompletedSlotIds.add(slotId)
    }
  }

  const sevenDayDates = buildDateWindow(today, 7)
  const thirtyDayDates = buildDateWindow(today, 30)
  const sevenDayTrend = buildTrend(sevenDayDates, visibleAttempts, schedules, {
    moduleIds,
    activeQuizIds,
    ignoredQuizIds,
    now,
    timezone: effectiveTimezone,
  })
  const thirtyDayTrend = buildTrend(thirtyDayDates, visibleAttempts, schedules, {
    moduleIds,
    activeQuizIds,
    ignoredQuizIds,
    now,
    timezone: effectiveTimezone,
  })

  const sevenDayAttempts = sevenDayTrend.reduce((sum, day) => sum + day.attemptCount, 0)
  const sevenDayCorrect = sevenDayTrend.reduce((sum, day) => sum + day.correctCount, 0)

  return {
    todayDueCount: dueSlotIds.size,
    todayCompletedCount: todayCompletedSlotIds.size,
    currentStreak,
    longestStreak,
    sevenDayAccuracy: percentage(sevenDayCorrect, sevenDayAttempts),
    sevenDayCorrect,
    sevenDayAttempts,
    sevenDayTrend,
    thirtyDayTrend,
    sevenDayStudyDays: sevenDayTrend.filter((day) => day.studyDay).length,
    thirtyDayStudyDays: thirtyDayTrend.filter((day) => day.studyDay).length,
    moduleCount: modules.length,
    totalAttempts: [...visibleAttempts.values()].reduce(
      (sum, attempts) => sum + attempts.length,
      0,
    ),
  }
}

interface TrendOptions {
  moduleIds: Set<string>
  activeQuizIds: Set<string>
  ignoredQuizIds: Set<string>
  now: Date
  timezone: string
}

function buildTrend(
  dates: string[],
  visibleAttempts: Map<string, AttemptRecord[]>,
  schedules: SchedulingData[],
  options: TrendOptions,
): StatsTrendDay[] {
  const days = new Map(dates.map((date) => [date, createEmptyTrendDay(date)]))

  for (const [, attempts] of visibleAttempts) {
    const ordered = [...attempts].sort(compareAttempts)
    const firstAttempt = ordered[0]

    for (const attempt of ordered) {
      const timestamp = attemptEventTimestamp(attempt)
      if (!isAttemptAtOrBeforeNow(attempt, options.now)) continue
      const date = localDateKey(new Date(timestamp), options.timezone)
      const day = days.get(date)
      if (!day) continue
      day.attemptCount += 1
      if (attempt.score >= PASS_THRESHOLD) day.correctCount += 1
      if (firstAttempt === attempt) {
        day.firstAttemptCount += 1
        if (attempt.score >= PASS_THRESHOLD) day.firstCorrectCount += 1
        day.newAttemptCount += 1
      } else {
        day.reviewAttemptCount += 1
      }
    }
  }

  const dueSlotsByDate = new Map<string, Set<string>>()
  const today = localDateKey(options.now, options.timezone)
  for (const schedule of visibleSchedules(
    schedules,
    options.moduleIds,
    options.activeQuizIds,
    options.ignoredQuizIds,
  )) {
    const dueTime = Date.parse(schedule.due)
    if (!Number.isFinite(dueTime)) continue
    const date = localDateKey(new Date(dueTime), options.timezone)
    const day = days.get(date)
    // Future times on today are not due yet. Dates after today cannot be present
    // in a past-to-today trend window. Today's bucket additionally represents
    // the currently due backlog, because the existing summary exposes that
    // same snapshot via todayDueCount.
    if (date === today && dueTime > options.now.getTime()) {
      continue
    }
    if (day) {
      const dueSlots = dueSlotsByDate.get(date) ?? new Set<string>()
      dueSlots.add(schedule.slotId)
      dueSlotsByDate.set(date, dueSlots)
      day.dueCount = dueSlots.size
    }

    if (date < today && dueTime <= options.now.getTime()) {
      const todayDueSlots = dueSlotsByDate.get(today) ?? new Set<string>()
      todayDueSlots.add(schedule.slotId)
      dueSlotsByDate.set(today, todayDueSlots)
      const todayDay = days.get(today)
      if (todayDay) todayDay.dueCount = todayDueSlots.size
    }
  }

  for (const [date, dueSlots] of dueSlotsByDate) {
    const completedSlots = new Set<string>()
    for (const slotId of dueSlots) {
      const attempts = visibleAttempts.get(slotId) ?? []
      if (
        attempts.some(
          (attempt) =>
            isAttemptAtOrBeforeNow(attempt, options.now) &&
            localDateKey(new Date(attemptEventTimestamp(attempt)), options.timezone) === date,
        )
      ) {
        completedSlots.add(slotId)
      }
    }
    const day = days.get(date)
    if (day) {
      day.dueCompletedCount = completedSlots.size
      day.dueCompletionRate = percentage(day.dueCompletedCount, day.dueCount)
    }
  }

  return [...days.values()].map((day) => ({
    ...day,
    accuracy: percentage(day.correctCount, day.attemptCount),
    firstCorrectRate: percentage(day.firstCorrectCount, day.firstAttemptCount),
    studyDay: day.attemptCount > 0,
  }))
}

function createEmptyTrendDay(date: string): StatsTrendDay {
  return {
    date,
    attemptCount: 0,
    correctCount: 0,
    accuracy: 0,
    firstAttemptCount: 0,
    firstCorrectCount: 0,
    firstCorrectRate: 0,
    dueCount: 0,
    dueCompletedCount: 0,
    dueCompletionRate: 0,
    reviewAttemptCount: 0,
    newAttemptCount: 0,
    studyDay: false,
  }
}

function visibleSchedules(
  schedules: SchedulingData[],
  moduleIds: Set<string>,
  activeQuizIds: Set<string>,
  ignoredQuizIds: Set<string>,
): SchedulingData[] {
  const seen = new Set<string>()
  return schedules.filter((schedule) => {
    if (
      !moduleIds.has(schedule.moduleId) ||
      !activeQuizIds.has(schedule.slotId) ||
      ignoredQuizIds.has(schedule.slotId) ||
      seen.has(schedule.slotId)
    ) {
      return false
    }
    seen.add(schedule.slotId)
    return true
  })
}

/**
 * 只接纳当前可见题目的作答，并按 slot 归一化。持久化数据损坏时，遍历
 * 过程也会按 attempt id 去重，避免同一记录被重复写入统计。
 */
function collectVisibleAttempts(
  attemptsBySlot: Record<string, AttemptRecord[]>,
  activeQuizIds: Set<string>,
): Map<string, AttemptRecord[]> {
  const result = new Map<string, AttemptRecord[]>()
  const seenAttemptIds = new Set<string>()

  for (const [storedSlotId, attempts] of Object.entries(attemptsBySlot)) {
    // attempts-store 以 originalQuizId 作为 bucket key；替换题只会改变
    // attempt.quizId，不能据此把同一 bucket 内的后续 retry 丢掉。
    const slotId = activeQuizIds.has(storedSlotId)
      ? storedSlotId
      : attempts.find((attempt) => activeQuizIds.has(attempt.quizId))?.quizId
    if (!slotId) continue

    for (const attempt of attempts) {
      if (seenAttemptIds.has(attempt.id)) continue
      seenAttemptIds.add(attempt.id)
      const existing = result.get(slotId) ?? []
      existing.push(attempt)
      result.set(slotId, existing)
    }
  }
  return result
}

function compareAttempts(left: AttemptRecord, right: AttemptRecord): number {
  const leftTime = attemptEventTimestamp(left)
  const rightTime = attemptEventTimestamp(right)
  if (leftTime !== rightTime) return leftTime - rightTime
  return left.id.localeCompare(right.id)
}

function attemptEventTimestamp(attempt: AttemptRecord): number {
  return Number.isFinite(attempt.answeredAt) ? attempt.answeredAt! : attempt.timestamp
}

function isAttemptAtOrBeforeNow(attempt: AttemptRecord, now: Date): boolean {
  const timestamp = attemptEventTimestamp(attempt)
  return Number.isFinite(timestamp) && Number.isFinite(now.getTime()) && timestamp <= now.getTime()
}

function buildDateWindow(today: string, days: number): string[] {
  const parsedToday = parseDateKey(today)
  if (!parsedToday) return []
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(parsedToday.getTime())
    date.setUTCDate(date.getUTCDate() - (days - index - 1))
    return formatDateKey(date)
  })
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100)
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function isValidInstant(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

function localDateKey(date: Date, timezone: string): string {
  if (!Number.isFinite(date.getTime()) || !isValidTimezone(timezone)) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isFinite(date.getTime()) ? date : null
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

export type { StatsTrendDay as DailyStats }
