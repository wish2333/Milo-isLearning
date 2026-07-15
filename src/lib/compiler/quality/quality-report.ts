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
import type { TokenUsage } from '@/lib/providers/types'

import { buildPedagogyReport, type PedagogyReport } from './pedagogy-report'

// =================================================================
// 类型
// =================================================================

export interface EstimatedCost {
  inputCost: number
  outputCost: number
  totalCost: number
  currency: string
}

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
  pedagogyCoverage: PedagogyReport
  mapperFixStats: MapperFixStats
  semanticEvalStats: SemanticEvalStats
  estimatedRuntimeEvalCost: EstimatedRuntimeEvalCost
  tokenUsage?: TokenUsage
  estimatedCost?: EstimatedCost
}

export interface MapperFixStats {
  totalFixes: number
  answerMovedToFirstOption: number
  duplicateOptionsRemoved: number
  shortExtendedKnowledgeFallback: number
  shortMisconceptionFallback: number
}

export interface SemanticEvalStats {
  calls: number
  cacheHits: number
  semanticAccepted: number
  providerFailures: number
}

export interface EstimatedRuntimeEvalCost {
  semanticCalls: number
  cacheHits: number
}

// =================================================================
// 成本估算
// =================================================================

/**
 * USD pricing per 1M tokens, keyed by ProviderKind.
 * Unknown providers fall back to a conservative default.
 */
const PRICING_USD_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
  deepseek: { input: 0.14, output: 0.28 },
  glm: { input: 0.5, output: 0.5 },
  'openai-compat': { input: 1.0, output: 3.0 },
}

export function estimateCost(usage: TokenUsage, provider: string): EstimatedCost {
  const pricing = PRICING_USD_PER_1M_TOKENS[provider] ?? { input: 1.0, output: 3.0 }
  const inputCost = (usage.promptTokens / 1_000_000) * pricing.input
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.output
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: 'USD',
  }
}

// =================================================================
// 构建辅助
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
 * @param meta   元数据（生成时间戳 + 可选的 mapper/semantic stats + 可选的 token 用量）
 */
export function buildQualityReport(
  module: Module,
  meta: {
    generatedAt: number
    mapperFixStats?: Partial<MapperFixStats>
    semanticEvalStats?: Partial<SemanticEvalStats>
    totalUsage?: TokenUsage
    providerKind?: string
  },
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
  const raw = meta.mapperFixStats ?? {}
  const answerMovedToFirstOption = raw.answerMovedToFirstOption ?? 0
  const duplicateOptionsRemoved = raw.duplicateOptionsRemoved ?? 0
  const shortExtendedKnowledgeFallback = raw.shortExtendedKnowledgeFallback ?? 0
  const shortMisconceptionFallback = raw.shortMisconceptionFallback ?? 0

  const mapperFixStats: MapperFixStats = {
    totalFixes:
      answerMovedToFirstOption +
      duplicateOptionsRemoved +
      shortExtendedKnowledgeFallback +
      shortMisconceptionFallback,
    answerMovedToFirstOption,
    duplicateOptionsRemoved,
    shortExtendedKnowledgeFallback,
    shortMisconceptionFallback,
  }
  const semanticEvalStats: SemanticEvalStats = {
    calls: 0,
    cacheHits: 0,
    semanticAccepted: 0,
    providerFailures: 0,
    ...meta.semanticEvalStats,
  }

  const tokenUsage = meta.totalUsage
  const estimatedCost =
    meta.totalUsage && meta.providerKind
      ? estimateCost(meta.totalUsage, meta.providerKind)
      : undefined

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
    pedagogyCoverage: buildPedagogyReport(module),
    mapperFixStats,
    semanticEvalStats,
    estimatedRuntimeEvalCost: {
      semanticCalls: semanticEvalStats.calls,
      cacheHits: semanticEvalStats.cacheHits,
    },
    tokenUsage,
    estimatedCost,
  }
}
