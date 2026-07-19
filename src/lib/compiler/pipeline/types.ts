/**
 * Knowledge Compiler Pipeline 类型契约（M3 W1）
 *
 * 对应 docs/M3-Plan.md §W1 与 §2.W1 类型设计。
 *
 * 设计要点：
 *   - CompileEvent 联合类型：异步生成器吐出的事件流，覆盖 4 种 kind
 *   - CompileStage：7 个编译阶段（按 PRD §5.3 进度表）
 *   - CompileConfig：调用方传入的 LLM 配置（compileModel/lightweightModel/llm）
 *   - CompileErrorPayload：内部异常翻译成前端可消费的结构（PRD US-06）
 *
 * 与 M2.5 的衔接：
 *   - runAgent(kind, input, provider, schema, options) — Agent 执行器
 *   - createProvider(config: LLMConfig) — Provider 工厂
 *   - assembleConcept / assembleQuiz / assembleFeynmanTask / assembleModule — 映射层
 *
 * 不在本文件做的事：
 *   - 实际 stage 编排（见 pipeline.ts）
 *   - 错误码到文案的映射（见 errors.ts）
 */
import type { Module } from '@/types/domain'
import type { CompileQualityReport } from '@/lib/compiler/quality/quality-report'
import type { LLMConfig } from '@/lib/providers'

// =================================================================
// 编译阶段
// =================================================================

/**
 * 编译阶段标识符，与 PRD §5.3 进度表对齐。
 *
 * percent 进度（pipeline.ts 内部约定，本类型不强制）：
 *   - import:  25%
 *   - chunk:   40%
 *   - concept: 55%
 *   - module:  65%
 *   - mission: 70%
 *   - quiz:    80%-95%（按完成 slot 数动态推进）
 *   - feynman: 100%
 */
export type CompileStage =
  | 'expand'
  | 'import'
  | 'chunk'
  | 'concept'
  | 'module'
  | 'mission'
  | 'quiz'
  | 'challenge'
  | 'feynman'

// =================================================================
// 编译事件流
// =================================================================

/**
 * pipeline 通过异步生成器吐出的事件流。
 *
 * 调用方 `for await (const event of compileMarkdown(md, cfg))` 流式消费。
 * 错误用 `error` 事件而非抛异常，让 SSE 流端保持打开直到完整结束
 * （前端能拿到完整错误上下文 + 修改建议）。
 */
export type CompileEvent =
  | { kind: 'stage_enter'; stage: CompileStage }
  | { kind: 'progress'; stage: CompileStage; percent: number; message?: string }
  | { kind: 'complete'; module: Module; qualityReport?: CompileQualityReport }
  | { kind: 'error'; error: CompileErrorPayload }

// =================================================================
// 调用方配置
// =================================================================

/**
 * 调用方传入的 LLM 配置。
 *
 * 字段语义：
 *   - `compileModel`：编译主体模型名（Chunk/Concept/Module/Mission/Quiz/Feynman 6 个 Agent）
 *   - `lightweightModel`：轻量模型名（Import / Feedback / Feynman-Eval，M3 仅 Import 实际使用）
 *   - `llm`：用户在 Settings 中填入的 LLMConfig（apiKey/baseURL/model/provider）
 *   - `enableThinking`：是否开启 thinking 模式（GLM enable_thinking）。默认 false（关闭）。
 *     注：底层 _runner 的 RunAgentOptions.disableThinking 与本字段语义相反，
 *     pipeline.ts 内部做 `disableThinking = !enableThinking` 取反转换。
 */
export interface CompileConfig {
  /** 编译主体模型名（如 'deepseek-v4-flash'） */
  compileModel: string
  /** 轻量模型名（Import 等，M3 阶段可与 compileModel 相同） */
  lightweightModel: string
  /** 用户提供的 LLM 配置（apiKey 等） */
  llm: LLMConfig
  /**
   * 覆盖默认 thinking 开关，默认 false（关闭 thinking）。
   *
   * 设计动机：M2.5 W3 在 AGENT_CONFIG 全部 disableThinking=true（即关闭）。
   * 这里 expose 给 eval/UI 层一个正向字段（"是否启用 thinking"），
   * pipeline.ts 转换为底层 disableThinking。
   */
  enableThinking?: boolean
}

// =================================================================
// 错误载荷
// =================================================================

/**
 * 错误载荷：把内部异常翻译成前端可消费的结构。
 *
 * 对应 PRD US-06（编译错误反馈）与 FR-01 AC3-5（输入校验）。
 * `message` / `hint` 为中文用户可读文案，`cause` 仅开发调试用（不入 UI）。
 */
export interface CompileErrorPayload {
  /** 发生错误的阶段（'input' = 入口校验，'unknown' = 未分类） */
  stage: CompileStage | 'input' | 'unknown'
  /** 错误码（决定前端文案与图标） */
  code: CompileErrorCode
  /** 用户可读中文文案 */
  message: string
  /** 修改建议（PRD US-06） */
  hint?: string
  /** 是否可重试（前端"重试"按钮显隐） */
  retryable: boolean
  /** 原始异常（开发调试用，不入 UI；JSON 序列化时尽量保留） */
  cause?: unknown
}

/**
 * 错误码枚举。与 PRD US-06 错误反馈文案表对齐。
 *
 * 完整文案映射见 errors.ts 的 ERROR_TABLE。
 */
export type CompileErrorCode =
  | 'input_too_short' // < INPUT_MIN_LENGTH
  | 'input_too_long' // > INPUT_MAX_LENGTH
  | 'input_invalid_encoding' // 非 UTF-8
  | 'no_valid_concept' // Concept Agent 提取失败（concept 数 = 0）
  | 'agent_output_invalid' // Schema 校验失败（含重试后）
  | 'llm_rate_limit' // 透传 ProviderError 429
  | 'llm_unavailable' // 透传 ProviderError 5xx
  | 'llm_network' // 透传 ProviderError timeout / DNS
  | 'quiz_batch_failure' // 单批 Quiz 失败率 > QUIZ_FAILURE_THRESHOLD
  | 'unknown'

// =================================================================
// 常量
// =================================================================

/** 输入 Markdown 最小字符数（PRD FR-01 AC3） */
export const INPUT_MIN_LENGTH = 200

/** 输入 Markdown 最大字符数（PRD FR-01 AC4） */
export const INPUT_MAX_LENGTH = 20000

/**
 * Quiz 批量失败熔断阈值。
 *
 * 失败率 ≤ 本阈值：失败 slot 降级（直接跳过 push，不写 LocalStorage）。
 * 失败率 > 本阈值：整体熔断，yield `quiz_batch_failure` error 事件。
 *
 * 20% 与 PRD §13.1 "编译产物难度失控" 风险阈值对齐。
 */
export const QUIZ_FAILURE_THRESHOLD = 0.2

/**
 * 各阶段的进度百分比（与 PRD §5.3 进度表对齐）。
 *
 * Quiz 阶段例外：80%-95% 之间按完成 slot 数动态推进。
 */
export const STAGE_PERCENT: Readonly<Record<Exclude<CompileStage, 'quiz'>, number>> = Object.freeze(
  {
    expand: 10,
    import: 25,
    chunk: 40,
    concept: 55,
    module: 65,
    mission: 70,
    challenge: 96,
    feynman: 100,
  },
)

/** Quiz 阶段进度区间（动态） */
export const QUIZ_PERCENT_START = 80
export const QUIZ_PERCENT_END = 95

// =================================================================
// Checkpoint / Resume 选项（PB.2 F04）
// =================================================================

/**
 * compileMarkdown 的可选参数，支持 checkpoint 写入和断点续编。
 *
 * 仅 production 模式使用（sessionId 由 /api/compile/session 分配）。
 * Showcase 模式不传 options，行为零回归。
 */
export interface CompileOptions {
  /** PB.1 编译 session ID（production 模式由 API route 传入） */
  sessionId?: string

  /**
   * 断点续编：跳过已完成 stage，从此 stage 开始执行。
   * 值为已完成的最后一个 stage（如 'module' 表示 stage 1-4 已完成，从 stage 5 恢复）。
   */
  resumeFrom?: CompileStage

  /**
   * 断点续编：已完成的 checkpoint 数据。
   * 由 route.ts 在 resume 场景下从 /api/compile/resume 获取后传入。
   * key = stage name，value = 该 stage 的 artifact 数据。
   */
  checkpointData?: Map<
    string,
    { artifact: unknown; usage?: { promptTokens: number; completionTokens: number } }
  >

  /**
   * Checkpoint 写入回调。当 sessionId 存在且 stage 完成时调用。
   * pipeline 自身不依赖 server-only 持久化层，由 route 注入。
   */
  writeCheckpoint?: (
    stage: string,
    artifact: unknown,
    usage?: { promptTokens: number; completionTokens: number },
  ) => void
}
