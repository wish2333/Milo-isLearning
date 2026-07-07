/**
 * Agent 调用参数配置：temperature / maxTokens / enableThinking
 *
 * 对应 docs/Prompt-Engineering.md §7.2（温度策略）与 §7.3（maxTokens 策略）。
 *
 * 设计意图：
 *   - 把"每个 Agent 该用什么采样参数"集中在一处，便于 A/B 与调优
 *   - GLM 默认 temperature=0.95 过高，所有调用必须显式覆盖（Prompt-Eng §7.2 末注）
 *   - 结构化输出 Agent（Import/Chunk/Feedback/Eval）低温度，生成型 Agent（Quiz/Feynman）高温度
 */
import type { AgentKind } from '@/lib/compiler/schemas'

/** 单个 Agent 的调用参数 */
export interface AgentCallConfig {
  /** 采样温度；越低越确定 */
  temperature: number
  /** 单次响应最大 token 数（取预估最大值的 ~2 倍，避免截断） */
  maxTokens: number
  /**
   * 是否关闭 thinking 模式（GLM enable_thinking=false）。
   * 结构化 / 评分场景关闭以稳定输出；生成场景可开启（Prompt-Eng §12.6）。
   * MVP 默认全部关闭，A/B 时再放开 Quiz / Feynman。
   */
  disableThinking: boolean
}

/**
 * 9 个 Agent 的调用参数表
 *
 * 来源：Prompt-Engineering.md §7.2 / §7.3。
 */
export const AGENT_CONFIG: Readonly<Record<AgentKind, AgentCallConfig>> = Object.freeze({
  // 编译期 7 个 Agent
  import: { temperature: 0.1, maxTokens: 4096, disableThinking: true },
  chunk: { temperature: 0.1, maxTokens: 8192, disableThinking: true },
  concept: { temperature: 0.3, maxTokens: 4096, disableThinking: true },
  module: { temperature: 0.3, maxTokens: 2048, disableThinking: true },
  mission: { temperature: 0.2, maxTokens: 4096, disableThinking: true },
  quiz: { temperature: 0.7, maxTokens: 2048, disableThinking: true },
  feynman: { temperature: 0.7, maxTokens: 8192, disableThinking: true },
  // 运行时 2 个 Agent
  feedback: { temperature: 0.1, maxTokens: 1024, disableThinking: true },
  'feynman-eval': { temperature: 0.2, maxTokens: 2048, disableThinking: true },
})

/** 取某 Agent 的调用配置 */
export function getAgentConfig(kind: AgentKind): AgentCallConfig {
  const cfg = AGENT_CONFIG[kind]
  if (!cfg) {
    throw new Error(`Unknown AgentKind: ${kind}`)
  }
  return cfg
}
