/**
 * Pipeline 错误码到用户文案映射 + 异常翻译（M3 W6）
 *
 * 对应 docs/M3-Plan.md §W6 错误码到文案 / 修改建议映射表。
 *
 * 设计要点：
 *   - ERROR_TABLE：把 CompileErrorCode 翻译成中文 message + hint + retryable + httpStatus
 *   - translateError(stage, e)：把内部异常（ProviderError / AgentOutputError / 通用 Error）
 *     翻译成 CompileErrorPayload
 *   - translateError(stage, e)：把内部异常（ProviderError / AgentOutputError / 通用 Error）
 *     翻译成 CompileErrorPayload
 */
import type { CompileErrorCode, CompileErrorPayload, CompileStage } from './types'

import { ProviderError } from '@/lib/providers'
import { AgentOutputError } from '@/lib/compiler/agents/errors'

// =================================================================
// 错误码到用户文案 / 修改建议映射表
// =================================================================

/**
 * 单个错误码的元数据。
 *
 * `messageTemplate` / `hintTemplate` 是带占位符的模板，由 `makeError` 填充。
 * 占位符语法：`{name}`，与 PromptVariables 替换约定一致。
 */
export interface ErrorMapping {
  /** 用户可读中文文案（可含占位符） */
  messageTemplate: string
  /** 修改建议（可含占位符） */
  hintTemplate?: string
  /** 是否可重试（前端"重试"按钮显隐） */
  retryable: boolean
  /** HTTP 状态码（4xx 客户端错误 / 5xx 服务端错误） */
  httpStatus: number
}

/**
 * 完整错误码映射表。
 *
 * 对应 M3-Plan §W6 表格。message 与 hint 文案与 PRD US-06 对齐。
 */
export const ERROR_TABLE: Readonly<Record<CompileErrorCode, ErrorMapping>> = Object.freeze({
  input_too_short: {
    messageTemplate: '内容过短，请补充至 200 字以上（当前 {n} 字符）',
    hintTemplate: '至少还需 {gap} 字符；可补充更多背景说明或示例',
    retryable: false,
    httpStatus: 400,
  },
  input_too_long: {
    messageTemplate: '内容超长，请缩减至 20000 字以内（当前 {n} 字符）',
    hintTemplate: '已超出 {gap} 字符；建议把 Markdown 拆成多个 1000-5000 字符的段落分别编译',
    retryable: false,
    httpStatus: 400,
  },
  input_invalid_encoding: {
    messageTemplate: '文件编码必须是 UTF-8',
    hintTemplate: '检查文件保存编码；VS Code 右下角可切换编码并保存为 UTF-8',
    retryable: false,
    httpStatus: 400,
  },
  no_valid_concept: {
    messageTemplate: '没能从内容中提取到足够概念',
    hintTemplate: '建议：① 增加段落 ② 标题层级更清晰（用 ## / ### 分节） ③ 避免纯代码块',
    retryable: true,
    httpStatus: 422,
  },
  agent_output_invalid: {
    messageTemplate: 'AI 输出不符合规范，已自动重试仍失败',
    hintTemplate: '可重新编译；若持续失败请缩短文本或简化结构',
    retryable: true,
    httpStatus: 502,
  },
  llm_rate_limit: {
    messageTemplate: 'LLM 服务限流（请求过于频繁）',
    hintTemplate: '稍等 1 分钟后重试；或切换供应商（Settings）',
    retryable: true,
    httpStatus: 429,
  },
  llm_unavailable: {
    messageTemplate: 'LLM 服务暂时不可用',
    hintTemplate: '稍后重试；或切换供应商（Settings）',
    retryable: true,
    httpStatus: 503,
  },
  llm_network: {
    messageTemplate: '网络异常（请求未到达 LLM 服务）',
    hintTemplate: '检查网络连接；或检查 baseURL 配置是否正确',
    retryable: true,
    httpStatus: 504,
  },
  quiz_batch_failure: {
    messageTemplate: '题目生成失败过多（失败率 {failureRate}%，超过 20% 阈值）',
    hintTemplate: '建议：① 缩短文本 ② 简化概念 ③ 切换更强模型（如 deepseek-v4-pro）',
    retryable: true,
    httpStatus: 502,
  },
  unknown: {
    messageTemplate: '编译失败，原因未知',
    hintTemplate: '请重试；持续失败请把错误码反馈给开发者',
    retryable: true,
    httpStatus: 500,
  },
})

// =================================================================
// 异常翻译：把内部异常翻译成 CompileErrorPayload
// =================================================================

/**
 * 把模板中的 `{key}` 占位符替换为 vars 中的值。
 *
 * 与 prompts/builder.ts 的 substituteVariables 同语义，但独立实现
 * （避免循环依赖）。
 */
function fillTemplate(template: string, vars: Record<string, string | number>): string {
  let out = template
  for (const [key, value] of Object.entries(vars)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\{${escaped}\\}`, 'g')
    out = out.replace(re, String(value))
  }
  return out
}

/**
 * 根据错误码 + 变量构造 CompileErrorPayload。
 *
 * @param stage    发生错误的阶段
 * @param code     错误码
 * @param vars     模板变量（用于填充 message / hint）
 * @param cause    原始异常（开发调试用）
 */
export function makeError(
  stage: CompileStage | 'input' | 'unknown',
  code: CompileErrorCode,
  vars: Record<string, string | number> = {},
  cause?: unknown,
): CompileErrorPayload {
  const mapping = ERROR_TABLE[code]
  const message = fillTemplate(mapping.messageTemplate, vars)
  const hint = mapping.hintTemplate ? fillTemplate(mapping.hintTemplate, vars) : undefined
  return {
    stage,
    code,
    message,
    hint,
    retryable: mapping.retryable,
    ...(cause !== undefined ? { cause } : {}),
  }
}

/**
 * 把捕获的异常翻译成 CompileErrorPayload。
 *
 * 识别三种异常：
 *   1. ProviderError：LLM 供应商层抛出，含 ProviderErrorKind 与 httpStatus
 *   2. AgentOutputError：Schema 校验失败（重试用尽）
 *   3. 其他 Error：归到 unknown
 *
 * ProviderErrorKind → CompileErrorCode 映射：
 *   - 'llm_rate_limit'   → 'llm_rate_limit'
 *   - 'llm_unavailable'  → 'llm_unavailable'
 *   - 'network'          → 'llm_network'
 *   - 'llm_client_error' → 'agent_output_invalid'（4xx 非 429，多为请求格式问题）
 *   - 'invalid_response' → 'agent_output_invalid'（响应体无法解析）
 *
 * AgentOutputError.reason → 'agent_output_invalid'
 * Concept Agent 阶段特别处理：reason 为 'schema_violation' 时归到 'no_valid_concept'
 * （由调用方按 stage 判断，本函数不做 stage 特例）。
 */
export function translateError(
  stage: CompileStage | 'input' | 'unknown',
  e: unknown,
): CompileErrorPayload {
  if (e instanceof ProviderError) {
    const code: CompileErrorCode = providerErrorKindToCode(e.kind)
    return makeError(stage, code, {}, e)
  }
  if (e instanceof AgentOutputError) {
    return makeError(stage, 'agent_output_invalid', {}, e)
  }
  // 通用 Error 或非 Error 抛出物：归 unknown
  return makeError(stage, 'unknown', {}, e)
}

/**
 * ProviderErrorKind → CompileErrorCode 映射。
 *
 * 抽出来独立函数便于单元测试。
 */
export function providerErrorKindToCode(kind: ProviderError['kind']): CompileErrorCode {
  switch (kind) {
    case 'llm_rate_limit':
      return 'llm_rate_limit'
    case 'llm_unavailable':
      return 'llm_unavailable'
    case 'network':
      return 'llm_network'
    case 'llm_client_error':
    case 'invalid_response':
      return 'agent_output_invalid'
    default: {
      // exhaustiveness check
      const exhaustive: never = kind
      return 'unknown'
      void exhaustive
    }
  }
}

// =================================================================
// Quiz 批量失败：专用错误构造（含 failureRate 变量）
// =================================================================

/**
 * 构造 Quiz 批量失败的 CompileErrorPayload。
 *
 * @param failureCount  失败 slot 数
 * @param totalCount    总 slot 数
 * @param cause         原始异常（首个失败 slot 的异常）
 */
export function makeQuizBatchError(
  failureCount: number,
  totalCount: number,
  cause?: unknown,
): CompileErrorPayload {
  const failureRate = Math.round((failureCount / totalCount) * 100)
  return makeError('quiz', 'quiz_batch_failure', { failureRate, failureCount, totalCount }, cause)
}

// =================================================================
// 输入校验：把"长度不达标"翻译成 error payload
// =================================================================

/**
 * 输入校验失败专用构造。
 *
 * @param code   'input_too_short' | 'input_too_long'
 * @param length 当前字符数
 */
export function makeInputError(
  code: 'input_too_short' | 'input_too_long',
  length: number,
): CompileErrorPayload {
  const target = code === 'input_too_short' ? 200 : 20000
  const gap = code === 'input_too_short' ? target - length : length - target
  return makeError('input', code, { n: length, gap })
}
