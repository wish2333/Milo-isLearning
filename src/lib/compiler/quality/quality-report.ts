/**
 * Minimal Compile Quality Report (M7.5)
 *
 * 纯函数：从编译完成的 Module + 元数据构建 CompileQualityReport。
 * 只观察、不阻断编译（M7.5 Plan §Global Constraints）。
 *
 * 报告字段：
 *   - 概念数 / 题数（Concept quiz + Challenge quiz + Feynman steps）/ Challenge 题数
 *   - 表达层级分布（1=Choice, 2=Sorting, 3=Fill Blank，全 Module 范围）
 *   - 阶梯分布（1=Recognition, 2=Discrimination, 3=Application，全 Module 范围）
 *   - 平均干扰项数 / Challenge 涉及的概念覆盖
 */

import type { Module } from '@/types/domain'

// =================================================================
// 类型
// =================================================================

export interface CompileQualityReport {
  moduleId: string
  generatedAt: number
  conceptCount: number
  quizCount: number
  challengeCount: number
  expressionDistribution: Record<1 | 2 | 3, number>
  ladderDistribution: Record<1 | 2 | 3, number>
  avgDistractorsPerQuiz: number
  challengeCoverage: { quizId: string; involvedConceptIds: string[] }[]
}

// =================================================================
// 构建
// =================================================================

/**
 * 收集 Module 内所有 Quiz（Concept + Challenge）用于分布统计。
 * Feynman steps 不参与 expression/ladder 分布（它们是固定模板），
 * 但参与 quizCount 总数。
 */
function collectAllQuizzes(module: Module): Array<{
  expressionLevel: 1 | 2 | 3
  ladderLevel: 1 | 2 | 3
  distractors: string[]
}> {
  const all: Array<{ expressionLevel: 1 | 2 | 3; ladderLevel: 1 | 2 | 3; distractors: string[] }> =
    []

  for (const concept of module.concepts) {
    for (const quiz of concept.quizSeries.quizzes) {
      all.push({
        expressionLevel: quiz.expressionLevel,
        ladderLevel: quiz.ladderLevel,
        distractors: quiz.distractors,
      })
    }
  }

  const challenges = module.challengeQuizzes ?? []
  for (const challenge of challenges) {
    all.push({
      expressionLevel: challenge.expressionLevel,
      ladderLevel: challenge.ladderLevel,
      distractors: challenge.distractors,
    })
  }

  return all
}

function countFeynmanSteps(module: Module): number {
  return module.feynmanTask.steps.length
}

/**
 * 从 Module + 元数据构建质量报告（纯函数，无副作用）。
 *
 * @param module 编译完成的 Module
 * @param meta   元数据（生成时间戳）
 */
export function buildQualityReport(
  module: Module,
  meta: { generatedAt: number },
): CompileQualityReport {
  const allQuizzes = collectAllQuizzes(module)
  const challenges = module.challengeQuizzes ?? []

  const expressionDistribution: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 }
  const ladderDistribution: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 }
  let distractorTotal = 0

  for (const q of allQuizzes) {
    expressionDistribution[q.expressionLevel]++
    ladderDistribution[q.ladderLevel]++
    distractorTotal += q.distractors.length
  }

  const avgDistractorsPerQuiz = allQuizzes.length === 0 ? 0 : distractorTotal / allQuizzes.length

  const challengeCoverage = challenges.map((c) => ({
    quizId: c.id,
    involvedConceptIds: c.involvedConceptIds ?? [],
  }))

  const quizCount = allQuizzes.length + countFeynmanSteps(module)

  return {
    moduleId: module.id,
    generatedAt: meta.generatedAt,
    conceptCount: module.concepts.length,
    quizCount,
    challengeCount: challenges.length,
    expressionDistribution,
    ladderDistribution,
    avgDistractorsPerQuiz,
    challengeCoverage,
  }
}
