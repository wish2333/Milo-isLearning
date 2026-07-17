/**
 * compile-with-expand — AI 扩充编译流水线
 *
 * 用户输入短主题词 → KnowledgeExpander 扩充为完整 Markdown + 知识页锚点
 * → 走现有 compileMarkdown 流水线 → 按 anchorId 回填知识页到 Concept。
 *
 * 对应 V2.0.0 Phase 2 X1 (P2.4 + P2.5 + P2.6)。
 */
import { runKnowledgeExpander } from '@/lib/compiler/agents/knowledge-expander'
import type {
  ConceptAnchor,
  ExpandedKnowledge,
} from '@/lib/compiler/agents/knowledge-expander-types'
import type { Concept, Module } from '@/types/domain'

import { translateError } from './errors'
import { compileMarkdown } from './pipeline'
import type { CompileConfig, CompileEvent, CompileOptions } from './types'

// =================================================================
// 类型

export interface BackfillResult {
  module: Module
  matchedAnchorIds: string[]
  unmatchedAnchors: ConceptAnchor[]
}

// =================================================================
// 回填：按 anchorId 把知识页写回 Concept

/**
 * 将 ExpandedKnowledge 的 conceptAnchors 按 anchorId 匹配回
 * module.concepts 中的 sourceAnchorId，写入 knowledgePage。
 *
 * 纯函数，不 mutate 入参。
 */
export function backfillKnowledgePagesById(
  module: Module,
  anchors: ConceptAnchor[],
): BackfillResult {
  const anchorById = new Map(anchors.map((a) => [a.anchorId, a]))
  const matchedAnchorIds: string[] = []

  const newConcepts: Concept[] = module.concepts.map((concept) => {
    const anchorId = concept.sourceAnchorId
    if (anchorId && anchorById.has(anchorId)) {
      const anchor = anchorById.get(anchorId)!
      matchedAnchorIds.push(anchorId)
      return { ...concept, knowledgePage: anchor.knowledgePage }
    }
    return concept
  })

  const unmatchedAnchors = anchors.filter((a) => !matchedAnchorIds.includes(a.anchorId))

  return {
    module: { ...module, concepts: newConcepts },
    matchedAnchorIds,
    unmatchedAnchors,
  }
}

// =================================================================
// 扩充编译生成器

/**
 * expand 模式的编译入口。
 *
 * 1. KnowledgeExpander 扩充短主题为完整 Markdown + anchors
 * 2. 透传给现有 compileMarkdown 流水线
 * 3. 在 complete 事件上回填 knowledgePage
 *
 * 支持断点续编：只要 checkpointData 中有 'expand' 就复用，
 * 不依赖 resumeFrom（避免 resume 后半段时丢失 expand checkpoint 的 bug）。
 */
export async function* compileWithExpand(
  topic: string,
  constraints: string | undefined,
  config: CompileConfig,
  options?: CompileOptions,
): AsyncGenerator<CompileEvent, void, unknown> {
  // 1. expand 阶段
  const expandCheckpoint = options?.checkpointData?.get('expand')
  let expanded: ExpandedKnowledge

  if (expandCheckpoint) {
    // resume: 复用已有 checkpoint，不 re-yield stage_enter（与 pipeline 已完成阶段一致）
    expanded = expandCheckpoint.artifact as ExpandedKnowledge
  } else {
    yield { kind: 'stage_enter', stage: 'expand' }
    yield { kind: 'progress', stage: 'expand', percent: 10, message: '正在扩充知识网络...' }

    try {
      const result = await runKnowledgeExpander(topic, constraints, {
        ...config.llm,
        model: config.compileModel,
      })
      expanded = result.data
      options?.writeCheckpoint?.('expand', expanded, result.usage)
    } catch (err: unknown) {
      yield { kind: 'error', error: translateError('expand', err) }
      return
    }
  }

  // 2. 走现有 pipeline（透传 options — checkpoint/resume 由 compileMarkdown 自己处理）
  for await (const event of compileMarkdown(expanded.normalizedSource, config, options)) {
    if (event.kind === 'complete') {
      const { module, unmatchedAnchors } = backfillKnowledgePagesById(
        event.module,
        expanded.conceptAnchors,
      )
      if (unmatchedAnchors.length > 0) {
        console.warn(
          `[compileWithExpand] ${unmatchedAnchors.length} 个 anchor 未匹配到 concept:`,
          unmatchedAnchors.map((a) => a.anchorId).join(', '),
        )
      }
      yield { kind: 'complete', module, qualityReport: event.qualityReport }
    } else {
      yield event
    }
  }
}
