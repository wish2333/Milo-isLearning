/**
 * Agent 调用参数配置：temperature / disableThinking
 *
 * 对应 docs/Prompt-Engineering.md §7.2（温度策略）。
 *
 * M3 W8 移除 maxTokens：显式设限在 DeepSeek V4 Flash 等模型上导致
 * 冗长推理消耗全部 budget 后输出被截断。改为不限制，由 API 端处理。
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
  /**
   * 是否关闭 thinking 模式（GLM enable_thinking=false）。
   * 结构化 / 评分场景关闭以稳定输出；生成场景可开启（Prompt-Eng §12.6）。
   * MVP 默认全部关闭，A/B 时再放开 Quiz / Feynman。
   *
   * 注意：仅 GLM 识别此参数；DeepSeek V4 Flash 不支持，忽略后仍输出冗长推理。
   */
  disableThinking: boolean
}

/**
 * 9 个 Agent 的调用参数表
 *
 * 来源：Prompt-Engineering.md §7.2。
 * M3 W8：全部移除 maxTokens（改为由 API 端默认值处理，避免显式限幅截断）。
 */
export const AGENT_CONFIG: Readonly<Record<AgentKind, AgentCallConfig>> = Object.freeze({
  // 编译期 7 个 Agent
  import: { temperature: 0.1, disableThinking: true },
  chunk: { temperature: 0.1, disableThinking: true },
  concept: { temperature: 0.3, disableThinking: true },
  module: { temperature: 0.3, disableThinking: true },
  mission: { temperature: 0.2, disableThinking: true },
  quiz: { temperature: 0.7, disableThinking: true },
  feynman: { temperature: 0.7, disableThinking: true },
  // 运行时 2 个 Agent
  feedback: { temperature: 0.1, disableThinking: true },
  'feynman-eval': { temperature: 0.2, disableThinking: true },
  'quiz-batch': { temperature: 0.7, disableThinking: true },
  'challenge-batch': { temperature: 0.7, disableThinking: true },
  // AI 扩充需兼顾长文结构化生成与稳定 JSON，采用中低温度。
  'knowledge-expander': { temperature: 0.4, disableThinking: true },
})

/** 取某 Agent 的调用配置 */
export function getAgentConfig(kind: AgentKind): AgentCallConfig {
  const cfg = AGENT_CONFIG[kind]
  if (!cfg) {
    throw new Error(`Unknown AgentKind: ${kind}`)
  }
  return cfg
}
