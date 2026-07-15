/**
 * 跨库错题聚合 — 扫描多个模块，收集符合 filter 的 slotId + Quiz。
 */

import type { AttemptRecord, Module, Quiz, ReviewFilter } from '@/types/domain'

const PASS_THRESHOLD = 80

/**
 * 判断单个 slot 是否匹配 filter 条件。
 */
export function matchesFilter(
  attempts: AttemptRecord[] | undefined,
  filter: ReviewFilter,
): boolean {
  if (!attempts || attempts.length === 0) return false
  const hasWrong = attempts.some((a) => a.score < PASS_THRESHOLD)
  const hasGuessed = attempts.some((a) => a.guessed === true)
  switch (filter) {
    case 'wrong':
      return hasWrong
    case 'guessed':
      return hasGuessed
    case 'all':
      return hasWrong || hasGuessed
  }
}

export interface CollectedReviewItem {
  moduleId: string
  slotId: string
  quiz: Quiz
}

/**
 * 扫描多个模块，收集符合 filter 的 review items。
 */
export function collectReviewItemsForModules(
  modules: Module[],
  attemptsBySlot: Record<string, AttemptRecord[]>,
  filter: ReviewFilter,
): CollectedReviewItem[] {
  const items: CollectedReviewItem[] = []

  for (const mod of modules) {
    const allQuizzes: Quiz[] = [
      ...mod.concepts.flatMap((c) => c.quizSeries.quizzes),
      ...(mod.challengeQuizzes ?? []),
    ]
    for (const quiz of allQuizzes) {
      if (quiz.ignored) continue
      if (matchesFilter(attemptsBySlot[quiz.id], filter)) {
        items.push({ moduleId: mod.id, slotId: quiz.id, quiz })
      }
    }
  }

  return items
}
