/**
 * computeTopicMastery -- 主题级别聚合掌握度（F23 / PB.6）
 *
 * 纯函数：给定 Topic + 各模块 Module 数据 + 作答记录 + 费曼记录，
 * 输出 TopicMastery 对象。
 *
 * 加权公式：
 *   weight_i  = module_i 的总测验数（Concept quiz + Challenge quiz + Feynman steps）
 *   aggregate = sum(moduleCompletion_i * weight_i) / sum(weight_i)
 *
 * 模块未找到或无测验时 weight=0，不参与加权。
 */

import type { AttemptRecord, FeynmanAttempt, Module, Topic, TopicMastery } from '@/types/domain'

import { computeMastery } from './mastery'

/**
 * 计算单个模块的总测验数（用作权重）。
 */
function computeModuleQuizCount(module: Module): number {
  const conceptQuizzes = module.concepts.reduce((sum, c) => sum + c.quizSeries.quizzes.length, 0)
  const challengeQuizzes = module.challengeQuizzes?.length ?? 0
  const feynmanSteps = module.feynmanTask.steps.length
  return conceptQuizzes + challengeQuizzes + feynmanSteps
}

/**
 * 从扁平的 attemptsBySlot 中提取属于指定模块的作答记录。
 *
 * 每个 slot 的 originalQuizId 对应模块内的某个 quiz id。
 * 通过遍历模块的所有 quiz id 来筛选。
 */
function extractModuleAttempts(
  module: Module,
  attemptsBySlot: Record<string, AttemptRecord[]>,
): Record<string, AttemptRecord[]> {
  const moduleQuizIds = new Set<string>(
    module.concepts.flatMap((c) => c.quizSeries.quizzes.map((q) => q.id)),
  )
  if (module.challengeQuizzes) {
    for (const q of module.challengeQuizzes) {
      moduleQuizIds.add(q.id)
    }
  }

  const result: Record<string, AttemptRecord[]> = {}
  for (const [slotId, attempts] of Object.entries(attemptsBySlot)) {
    if (moduleQuizIds.has(slotId)) {
      result[slotId] = attempts
    }
  }
  return result
}

/**
 * 计算主题级别的聚合掌握度。
 *
 * @param topic 主题定义（提供 topicId + moduleIds 顺序）
 * @param modules moduleIds 对应的 Module 对象数组（长度可小于 moduleIds，缺失模块跳过）
 * @param attemptsBySlot 扁平作答历史，以 originalQuizId（槽位 id）为 key
 * @param feynmanAttempts 以 moduleId 为 key 的费曼记录（可选）
 * @returns TopicMastery 聚合结果
 */
export function computeTopicMastery(
  topic: Topic,
  modules: Module[],
  attemptsBySlot: Record<string, AttemptRecord[]>,
  feynmanAttempts?: Record<string, FeynmanAttempt>,
): TopicMastery {
  const moduleMasteries: TopicMastery['moduleMasteries'] = []
  let totalWeight = 0
  let weightedSum = 0
  let totalQuizzes = 0
  let completedModules = 0

  for (const mod of modules) {
    const quizCount = computeModuleQuizCount(mod)
    const moduleAttempts = extractModuleAttempts(mod, attemptsBySlot)
    const feynman = feynmanAttempts?.[mod.id]

    const mastery = computeMastery(mod, moduleAttempts, feynman)

    // moduleCompletion === 100 视为已完成
    if (mastery.moduleCompletion === 100) {
      completedModules++
    }

    // weight=0 的模块不参与加权（避免除零，避免空模块污染聚合值）
    if (quizCount > 0) {
      totalWeight += quizCount
      weightedSum += mastery.moduleCompletion * quizCount
    }

    totalQuizzes += quizCount

    moduleMasteries.push({
      moduleId: mod.id,
      moduleTitle: mod.title,
      mastery,
      weight: quizCount,
    })
  }

  const aggregateMastery = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0

  return {
    topicId: topic.id,
    aggregateMastery,
    moduleMasteries,
    totalQuizzes,
    completedModules,
  }
}
