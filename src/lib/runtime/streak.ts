/**
 * 连续学习统计。
 *
 * Streak 是从作答事件派生的用户反馈数据，和 attempts 一样通过统一的
 * StorageRepository 存取，因而 showcase 与 production 使用同一套逻辑。
 */

import type { StudyStreak } from '@/types/domain'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { getStorage } from '@/lib/persistence/client/storage'
import type { StorageRepository } from '@/lib/persistence/shared/repository'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function loadStreak(repo: StorageRepository = getStorage()): StudyStreak | null {
  return repo.get<StudyStreak>(StorageKeys.streak)
}

export function saveStreak(streak: StudyStreak, repo: StorageRepository = getStorage()): void {
  repo.set(StorageKeys.streak, streak)
}

/**
 * 按本地日历日期推进 streak。该函数保持纯同步，便于启动迁移和测试复用。
 * 相同日期不会重复增加 totalStudyDays；非昨天的日期会重新开始当前 streak。
 */
export function updateStreak(streak: StudyStreak | null, todayLocalDate: string): StudyStreak {
  if (!DATE_PATTERN.test(todayLocalDate)) {
    throw new Error(`无效的本地日期: ${todayLocalDate}`)
  }

  if (!streak || !DATE_PATTERN.test(streak.lastStudyDate)) {
    return {
      currentStreak: 1,
      longestStreak: 1,
      lastStudyDate: todayLocalDate,
      totalStudyDays: 1,
    }
  }

  if (streak.lastStudyDate === todayLocalDate) {
    return { ...streak }
  }

  const currentStreak = isYesterday(streak.lastStudyDate, todayLocalDate)
    ? streak.currentStreak + 1
    : 1
  const longestStreak = Math.max(streak.longestStreak, currentStreak)

  return {
    currentStreak,
    longestStreak,
    lastStudyDate: todayLocalDate,
    totalStudyDays: streak.totalStudyDays + 1,
  }
}

/** 返回给定时区的 YYYY-MM-DD，默认使用浏览器本地时区。 */
export function localDateString(
  date: Date = new Date(),
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  if (!Number.isFinite(date.getTime())) throw new Error('无效的日期')

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}

function isYesterday(previousDate: string, todayDate: string): boolean {
  const previous = parseLocalDate(previousDate)
  const today = parseLocalDate(todayDate)
  if (!previous || !today) return false
  return today.getTime() - previous.getTime() === 24 * 60 * 60 * 1000
}

function parseLocalDate(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  // UTC midnight makes date arithmetic independent of the process timezone.
  const date = new Date(Date.UTC(year, month - 1, day))
  return Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null
}
