/**
 * computeMastery 纯函数（Tech Spec §5.4 / FR-07）
 *
 * 设计意图：
 *   掌握度计算是纯函数——给定 Module + 作答历史 + 费曼记录，
 *   输出确定的 Mastery 对象。无副作用、可缓存、可重算。
 *
 * 计算规则：
 *   - conceptMastery = Concept 内所有槽位的"首次答对率"
 *     （attemptVersion === 0 且 score >= 80 的槽位数 / 总槽数 × 100）
 *   - moduleCompletion = 已完成 Quiz 数 / 总 Quiz 数 × 100
 *     （含 Concept 槽位 + Feynman 6 步）
 *   - feynmanScore = FeynmanAttempt.finalScore（未提交时为 undefined）
 */

import type { AttemptRecord, FeynmanAttempt, Mastery, Module } from '@/types/domain'

import { isSlotCompleted } from './retry-policy'

/** score >= 80 视为"答对"（与 Feedback Schema next_action 一致性规则对齐） */
const PASS_THRESHOLD = 80

/**
 * 计算单个 Concept 的掌握度（首次答对率）。
 *
 * "首次答对" = attemptVersion === 0 的记录中 score >= 80。
 * 若某槽位无任何作答记录，不计为答对。
 *
 * @param conceptQuizzes 该 Concept 的全部 Quiz（即槽位）
 * @param attemptsBySlot 以 originalQuizId 为 key 的作答历史
 * @returns 0-100 的掌握度分数
 */
function computeConceptMastery(
  conceptQuizzes: Module['concepts'][number]['quizSeries']['quizzes'],
  attemptsBySlot: Record<string, AttemptRecord[]>,
  excludeGuessed = false,
): number {
  // F41: 忽略的题不计入掌握度
  const activeQuizzes = conceptQuizzes.filter((q) => !q.ignored)
  if (activeQuizzes.length === 0) return 0

  let firstAttemptPassed = 0
  for (const quiz of activeQuizzes) {
    const slotAttempts = attemptsBySlot[quiz.id]
    if (!slotAttempts || slotAttempts.length === 0) continue

    const firstAttempt = slotAttempts.find((a) => a.attemptVersion === 0)
    if (firstAttempt && firstAttempt.score >= PASS_THRESHOLD) {
      if (!excludeGuessed || !firstAttempt.guessed) {
        firstAttemptPassed++
      }
    }
  }

  return Math.round((firstAttemptPassed / activeQuizzes.length) * 100)
}

/**
 * 计算 Module 的整体掌握度。
 *
 * @param module 编译产物 Module（含 concepts + feynmanTask）
 * @param attemptsBySlot 以 originalQuizId（槽位 id）为 key 的作答历史
 * @param feynmanAttempt 费曼作答记录（未开始时为 undefined）
 * @returns 完整的 Mastery 对象
 */
export function computeMastery(
  module: Module,
  attemptsBySlot: Record<string, AttemptRecord[]>,
  feynmanAttempt?: FeynmanAttempt,
): Mastery {
  // --- 1. conceptMastery：每 Concept 的首次答对率（含蒙对）+ 排除蒙对版本 ---
  const conceptMastery = module.concepts.map((concept) => ({
    conceptId: concept.id,
    mastery: computeConceptMastery(concept.quizSeries.quizzes, attemptsBySlot),
  }))
  const conceptMasteryExcludingGuessed = module.concepts.map((concept) => ({
    conceptId: concept.id,
    mastery: computeConceptMastery(concept.quizSeries.quizzes, attemptsBySlot, true),
  }))

  // --- 2. moduleCompletion：已完成 Quiz / 总 Quiz ---
  // 总 Quiz = 所有 Concept 的 quizSeries.quizzes（排除 ignored）+ Challenge 题（排除 ignored）+ Feynman 6 步
  const totalConceptQuizzes = module.concepts.reduce(
    (sum, c) => sum + c.quizSeries.quizzes.filter((q) => !q.ignored).length,
    0,
  )
  const totalChallengeQuizzes = (module.challengeQuizzes ?? []).filter((q) => !q.ignored).length
  const totalFeynmanSteps = module.feynmanTask.steps.length // 6
  const totalQuizzes = totalConceptQuizzes + totalChallengeQuizzes + totalFeynmanSteps

  let completedQuizzes = 0

  // Concept 槽位：检查每个非忽略槽位是否已完成（通过或被强制推进）
  for (const concept of module.concepts) {
    for (const quiz of concept.quizSeries.quizzes) {
      if (quiz.ignored) continue
      const slotAttempts = attemptsBySlot[quiz.id]
      if (slotAttempts && isSlotCompleted(slotAttempts)) {
        completedQuizzes++
      }
    }
  }

  // Challenge 槽位：检查每个非忽略槽位是否已完成
  if (module.challengeQuizzes) {
    for (const quiz of module.challengeQuizzes) {
      if (quiz.ignored) continue
      const slotAttempts = attemptsBySlot[quiz.id]
      if (slotAttempts && isSlotCompleted(slotAttempts)) {
        completedQuizzes++
      }
    }
  }

  // Feynman 步：检查 feynmanAttempt.stepResults
  let feynmanCompletedSteps = 0
  if (feynmanAttempt) {
    feynmanCompletedSteps = feynmanAttempt.stepResults.length
  }
  completedQuizzes += feynmanCompletedSteps

  // 全部题被忽略时视为无可学内容 → moduleCompletion = 100
  const moduleCompletion =
    totalQuizzes > 0 ? Math.round((completedQuizzes / totalQuizzes) * 100) : 100

  // --- 3. Challenge 掌握度（首次答对率，无非忽略 Challenge 题时为 undefined）---
  let challengeMastery: number | undefined
  let challengeMasteryExcludingGuessed: number | undefined
  const activeChallengeQuizzes = (module.challengeQuizzes ?? []).filter((q) => !q.ignored)
  if (activeChallengeQuizzes.length > 0) {
    let challengeFirstPassed = 0
    let challengeFirstPassedExcludingGuessed = 0
    for (const quiz of activeChallengeQuizzes) {
      const slotAttempts = attemptsBySlot[quiz.id]
      if (!slotAttempts || slotAttempts.length === 0) continue
      const firstAttempt = slotAttempts.find((a) => a.attemptVersion === 0)
      if (firstAttempt && firstAttempt.score >= PASS_THRESHOLD) {
        challengeFirstPassed++
        if (!firstAttempt.guessed) {
          challengeFirstPassedExcludingGuessed++
        }
      }
    }
    challengeMastery = Math.round((challengeFirstPassed / activeChallengeQuizzes.length) * 100)
    challengeMasteryExcludingGuessed = Math.round(
      (challengeFirstPassedExcludingGuessed / activeChallengeQuizzes.length) * 100,
    )
  }

  // --- 4. Feynman 完成状态与得分 ---
  const feynmanCompleted = feynmanAttempt !== undefined && feynmanAttempt.finalScore !== undefined
  const feynmanScore = feynmanAttempt?.finalScore

  return {
    moduleId: module.id,
    moduleCompletion,
    conceptMastery,
    conceptMasteryExcludingGuessed,
    challengeMastery,
    challengeMasteryExcludingGuessed,
    feynmanCompleted,
    feynmanScore,
  }
}
