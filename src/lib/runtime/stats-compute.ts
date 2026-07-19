/**
 * 轻量学习统计。
 *
 * 统计只读取已经持久化的 Module、作答记录和 FSRS 调度缓存，不修改任何
 * 状态。日期边界统一按浏览器传入的 IANA 时区计算，避免 production
 * 服务端时区影响“今天”和近 7 日统计。
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
  moduleCount: number
  totalAttempts: number
}

const PASS_THRESHOLD = 80
const DAY_MS = 24 * 60 * 60 * 1000

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

  const today = localDateKey(now, timezone)
  const dueSlotIds = new Set(
    schedules
      .filter(
        (schedule) =>
          moduleIds.has(schedule.moduleId) &&
          activeQuizIds.has(schedule.slotId) &&
          !ignoredQuizIds.has(schedule.slotId) &&
          isValidInstant(schedule.due) &&
          Date.parse(schedule.due) <= now.getTime(),
      )
      .map((schedule) => schedule.slotId),
  )

  const todayCompletedSlotIds = new Set<string>()
  let sevenDayAttempts = 0
  let sevenDayCorrect = 0
  let totalAttempts = 0

  for (const [slotId, attempts] of Object.entries(attemptsBySlot)) {
    // Attempts 可能残留于旧题库或另一种 ContentOrigin；统计只纳入当前可见
    // Module 的槽位。重试题的 quizId 会变化，因此同时检查槽位 key 和记录
    // 中的实际 quizId。
    const belongsToVisibleModule =
      activeQuizIds.has(slotId) || attempts.some((attempt) => activeQuizIds.has(attempt.quizId))
    if (!belongsToVisibleModule) continue

    totalAttempts += attempts.length
    for (const attempt of attempts) {
      if (dueSlotIds.has(slotId) && localDateKey(new Date(attempt.timestamp), timezone) === today) {
        todayCompletedSlotIds.add(slotId)
      }
      if (isWithinLastSevenLocalDays(attempt.timestamp, now, timezone)) {
        sevenDayAttempts += 1
        if (attempt.score >= PASS_THRESHOLD) sevenDayCorrect += 1
      }
    }
  }

  return {
    todayDueCount: dueSlotIds.size,
    todayCompletedCount: todayCompletedSlotIds.size,
    currentStreak,
    longestStreak,
    sevenDayAccuracy:
      sevenDayAttempts === 0 ? 0 : Math.round((sevenDayCorrect / sevenDayAttempts) * 100),
    sevenDayCorrect,
    sevenDayAttempts,
    moduleCount: modules.length,
    totalAttempts,
  }
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

function isWithinLastSevenLocalDays(timestamp: number, now: Date, timezone: string): boolean {
  const attemptDate = localDateKey(new Date(timestamp), timezone)
  const today = localDateKey(now, timezone)
  if (!attemptDate || !today) return false
  const attemptUtc = parseDateKey(attemptDate)
  const todayUtc = parseDateKey(today)
  if (!attemptUtc || !todayUtc) return false
  const difference = (todayUtc.getTime() - attemptUtc.getTime()) / DAY_MS
  return Number.isInteger(difference) && difference >= 0 && difference < 7
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
