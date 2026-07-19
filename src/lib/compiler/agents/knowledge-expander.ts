/**
 * X1 AI 扩充 Agent。
 *
 * 与既有编译 Agent 一样，实际的 prompt 构建、JSON 解析、Schema 校验和重试
 * 统一交给 runAgent；本文件只负责输入约束、Provider 准备与类型化返回值。
 */
import { createProvider, type LLMConfig, type LLMProvider } from '@/lib/providers'

import { runAgent, type RunAgentOptions } from './_runner'
import { expandedKnowledgeSchema, type ExpandedKnowledge } from './knowledge-expander-types'

/** 可注入 Provider，便于单测不访问真实 LLM。 */
export interface KnowledgeExpanderOptions extends RunAgentOptions {
  provider?: LLMProvider
}

/** KnowledgeExpander 的返回值与 runAgent 保持一致，便于 pipeline 聚合 token 用量。 */
export interface KnowledgeExpanderResult {
  data: ExpandedKnowledge
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
}

function validateTopic(topic: string): string {
  const normalized = topic.trim()
  if (normalized.length < 5 || normalized.length > 50) {
    throw new Error('扩充主题长度必须为 5-50 字')
  }
  return normalized
}

/**
 * 围绕短主题生成完整学习材料与稳定概念锚点。
 *
 * @param topic 5-50 字主题词
 * @param constraints 可选的受众、深度或范围约束
 * @param config LLM 配置；测试场景可通过 options.provider 注入 mock
 */
export async function runKnowledgeExpander(
  topic: string,
  constraints: string | undefined,
  config: LLMConfig,
  options?: KnowledgeExpanderOptions,
): Promise<KnowledgeExpanderResult> {
  const normalizedTopic = validateTopic(topic)
  const provider = options?.provider ?? createProvider(config)

  return runAgent(
    'knowledge-expander',
    {
      topic: normalizedTopic,
      constraints: constraints?.trim() ?? '',
    },
    provider,
    expandedKnowledgeSchema,
    options,
  )
}

/** 语义更短的别名，供 expand pipeline 调用。 */
export const expandKnowledge = runKnowledgeExpander
