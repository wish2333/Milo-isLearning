/**
 * Agent 通用调用运行器：buildPrompt → provider.chat → JSON.parse → Zod 校验，含 1 次重试。
 *
 * 对应 docs/Technical-Specification.md §4.3 与 docs/Prompt-Engineering.md §6.3。
 *
 * 重试策略（NFR-R4）：
 *   1. 调 LLM（response_format=json_object，由 provider 层依据 jsonSchema 触发）
 *   2. 取 message.content；为空 → 追加 system 提示"响应为空"，retry 1 次
 *   3. JSON.parse 失败 → 追加 system 提示错误信息，retry 1 次
 *   4. schema.safeParse 失败 → 追加 system 提示校验问题，retry 1 次
 *   5. 仍失败 → 抛 AgentOutputError(kind, reason, raw)，上层 UI 提示"AI 输出不规范"
 *
 * 注：每类失败最多 retry 1 次（共 2 次尝试），避免无限重试拖垮编译时长（NFR-P1）。
 */
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { ZodSchema } from 'zod'

import type { AgentKind } from '@/lib/compiler/schemas'
import type { ChatMessage, LLMProvider } from '@/lib/providers/types'

import { buildPrompt, type PromptVariables } from '../prompts/builder'
import { getAgentConfig } from './config'
import { AgentOutputError, formatZodIssues, safeParseJSON, type AgentFailureReason } from './errors'

/** 最大尝试次数（含首次）：1 次原始 + 1 次重试 */
const MAX_ATTEMPTS = 2

/**
 * 运行选项（M2.5 W2 eval 脚本透传用）。
 *
 * - `disableThinking`：覆盖 `AGENT_CONFIG[kind].disableThinking`，让 eval 脚本能切换 A/B
 *   默认 undefined → 使用 config 默认值（M2.5 全部为 true）
 */
export interface RunAgentOptions {
  disableThinking?: boolean
}

/**
 * 追加重试提示到对话尾部。
 *
 * 使用 system 角色（对齐 Tech Spec §4.3 伪代码），让 LLM 明确这是来自系统的纠正指令。
 */
function appendRetryHint(messages: ChatMessage[], hint: string): void {
  messages.push({ role: 'system', content: hint })
}

/**
 * 通用 Agent 调用：模板渲染 → LLM 调用 → 解析 → 校验。
 *
 * @param kind     Agent 类型（决定模板 / temperature / maxTokens）
 * @param input    模板变量（白名单替换）
 * @param provider LLM 供应商实例（已配置好 apiKey / baseURL / model）
 * @param schema   该 Agent 输出的 Zod Schema（决定校验与 jsonSchema 提示）
 * @returns        Schema 校验通过的数据
 * @throws         AgentOutputError 重试后仍失败时
 */
export async function runAgent<T>(
  kind: AgentKind,
  input: PromptVariables,
  provider: LLMProvider,
  schema: ZodSchema<T>,
  options?: RunAgentOptions,
): Promise<T> {
  const config = getAgentConfig(kind)
  const messages = buildPrompt(kind, input)
  // 作为 response_format=json_object 的提示传入（provider 层据 truthy jsonSchema 启用）
  const jsonSchemaHint = zodToJsonSchema(schema, { name: undefined })
  // GLM enable_thinking 透传（M2.5 W3）：disableThinking=true 时强制关闭。
  // DeepSeek V4 不识别此字段，透传后被忽略，无副作用（M2.5-Plan §2.W3）。
  // options.disableThinking 优先于 config（eval A/B 用）
  const disableThinking = options?.disableThinking ?? config.disableThinking
  const extraBody = disableThinking ? { enable_thinking: false } : undefined

  let lastReason: AgentFailureReason = 'empty_content'
  let lastRaw = ''

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await provider.chat({
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      jsonSchema: jsonSchemaHint,
      ...(extraBody ? { extraBody } : {}),
    })

    const raw = response.content
    lastRaw = raw

    // 1. 空内容（DeepSeek 长输出偶发）或被截断
    if (raw.trim() === '') {
      lastReason = 'empty_content'
      const note =
        response.finishReason === 'length'
          ? '上一次响应被 max_tokens 截断导致内容为空，请压缩输出并严格返回一个完整 JSON 对象。'
          : '上一次响应内容为空。请严格返回一个合法 JSON 对象。'
      appendRetryHint(messages, note)
      continue
    }
    // finish_reason=length 但内容非空：JSON 大概率不完整，仍尝试解析（解析失败会走 retry）

    // 2. JSON 解析
    const parsed = safeParseJSON(raw)
    if (!parsed.ok) {
      lastReason = 'invalid_json'
      appendRetryHint(
        messages,
        `上一次响应不是合法 JSON：${parsed.error}。请只输出一个严格匹配 Schema 的 JSON 对象，不要包含任何解释或 markdown 代码块。`,
      )
      continue
    }

    // 3. Zod Schema 校验
    const result = schema.safeParse(parsed.value)
    if (result.success) {
      return result.data
    }
    lastReason = 'schema_violation'
    appendRetryHint(
      messages,
      `上一次响应未通过 Schema 校验：\n${formatZodIssues(result.error.issues)}\n请严格按 Schema 修正后重新输出。`,
    )
  }

  // 两次尝试均失败
  throw new AgentOutputError(kind, lastReason, lastRaw)
}
