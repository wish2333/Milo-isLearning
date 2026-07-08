/**
 * Retry Policy — 连续失败次数追踪与强制推进（Tech Spec §5.3 / FR-04）
 *
 * 设计意图：
 *   用户在同一 Quiz 槽位连续答错 N 次后，不应无限循环。
 *   达到阈值时强制 advance，避免挫败感。
 *
 * 规则：
 *   - "失败" = AttemptRecord.nextAction === 'retry'（即 score < 80）
 *   - "连续" = 从最新记录向前数，遇到 nextAction === 'advance' 即断开
 *   - 阈值 = MAX_CONSECUTIVE_FAILURES（3 次）→ 第 3 次失败后强制 advance
 */

import type { AttemptRecord } from '@/types/domain'

/** 连续失败多少次后强制推进 */
export const MAX_CONSECUTIVE_FAILURES = 3

/**
 * 从一组 AttemptRecord（同一 originalQuizId 的全部历史）中，
 * 计算当前连续失败次数。
 *
 * @param attempts 同一槽位的全部作答记录（不需要预排序，函数内按 timestamp 排序）
 * @returns 从最新向前数的连续 retry 次数
 */
export function getConsecutiveFailures(attempts: AttemptRecord[]): number {
  if (attempts.length === 0) return 0

  const sorted = [...attempts].sort((a, b) => a.timestamp - b.timestamp)

  let count = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const attempt = sorted[i]
    if (attempt && attempt.nextAction === 'retry') {
      count++
    } else {
      break
    }
  }
  return count
}

/**
 * 判断当前是否应该强制推进（跳过 retry，直接 advance）。
 *
 * 调用时机：用户作答 → Feedback Agent 返回 retry → 检查此函数。
 * 若返回 true，progress-store 调用 advance() 而非 retry()。
 *
 * @param attempts 同一槽位的全部作答记录
 * @returns true = 连续失败已达阈值，应强制 advance
 */
export function shouldForceAdvance(attempts: AttemptRecord[]): boolean {
  return getConsecutiveFailures(attempts) >= MAX_CONSECUTIVE_FAILURES
}

/**
 * 判断用户在此槽位是否已经"通过"（advance 或被强制推进）。
 *
 * 用于 Mastery 计算：一个槽位"已完成"的条件是：
 *   - 存在 nextAction === 'advance' 的记录（正常通过），或
 *   - 连续 retry 次数 >= MAX_CONSECUTIVE_FAILURES（被强制推进）
 *
 * @param attempts 同一槽位的全部作答记录
 */
export function isSlotCompleted(attempts: AttemptRecord[]): boolean {
  if (attempts.length === 0) return false
  return attempts.some((a) => a.nextAction === 'advance') || shouldForceAdvance(attempts)
}
