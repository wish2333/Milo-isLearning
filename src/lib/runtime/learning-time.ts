/**
 * 学习时长统计工具
 *
 * F13: 从 AttemptRecord 数组聚合学习时长并格式化显示。
 */

import type { AttemptRecord } from '@/types/domain'

export interface LearningTimeSummary {
  /** 总时长（秒） */
  totalSeconds: number
  /** 平均每题时长（秒） */
  avgSeconds: number
  /** 是否有可用的时长数据 */
  hasTimeData: boolean
  /** 格式化的总时长文字 */
  formattedTotal: string
  /** 格式化的平均时长文字 */
  formattedAvg: string
}

/**
 * 从一组 AttemptRecord 聚合学习时长。
 * 只统计有 answeredAt 的记录（即 F13 之后的新数据）。
 */
export function computeLearningTime(attempts: AttemptRecord[]): LearningTimeSummary {
  const timed = attempts.filter((a) => a.answeredAt !== undefined)
  const totalTimeMs = timed.reduce((sum, a) => sum + (a.timeSpentMs ?? 0), 0)
  const totalSeconds = Math.round(totalTimeMs / 1000)
  const avgSeconds = timed.length > 0 ? Math.round(totalTimeMs / timed.length / 1000) : 0

  return {
    totalSeconds,
    avgSeconds,
    hasTimeData: timed.length > 0,
    formattedTotal: formatDuration(totalSeconds),
    formattedAvg: formatDuration(avgSeconds),
  }
}

function formatDuration(seconds: number): string {
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
  }
  return `${seconds} 秒`
}
