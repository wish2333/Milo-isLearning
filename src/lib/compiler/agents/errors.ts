/**
 * Agent 运行时错误与 JSON 安全解析工具
 *
 * 对应 docs/Technical-Specification.md §4.3（runAgent 重试模板）与
 * docs/Prompt-Engineering.md §6.3（重试策略）。
 *
 * 设计意图：
 *   - AgentOutputError 携带 kind / reason / raw，便于上层 UI 精准提示"AI 输出不规范"
 *   - safeParseJSON 返回 discriminated union，避免 try/catch 吞错（parse-don't-validate）
 */
import type { AgentKind } from '@/lib/compiler/schemas'

/** Agent 输出失败的根因分类（用于错误上报与埋点） */
export type AgentFailureReason =
  | 'empty_content' // LLM 返回空字符串（DeepSeek 长输出偶发）
  | 'invalid_json' // content 不是合法 JSON
  | 'schema_violation' // JSON 合法但未通过 Zod Schema 校验

/**
 * Agent 输出不规范错误
 *
 * 抛出时机：runAgent 重试 1 次后仍失败（NFR-R4）。
 * 上层（API route / UI）捕获后提示用户"AI 输出不规范，请重试"。
 */
export class AgentOutputError extends Error {
  constructor(
    public readonly kind: AgentKind,
    public readonly reason: AgentFailureReason,
    public readonly raw: string,
  ) {
    const rawPreview = raw.length > 200 ? `${raw.slice(0, 200)}…(${raw.length} chars)` : raw
    super(`Agent "${kind}" 输出不规范（${reason}）。原始响应：${rawPreview}`)
    this.name = 'AgentOutputError'
  }
}

/** safeParseJSON 的成功结果 */
export interface JsonParseOk {
  ok: true
  value: unknown
}

/** safeParseJSON 的失败结果 */
export interface JsonParseErr {
  ok: false
  error: string
}

/**
 * 尝试从字符串中提取 JSON 对象。
 *
 * 处理策略（按优先级）：
 *   1. 先 trim（LLM 偶发前后空白）
 *   2. 尝试提取 markdown 代码块中的 JSON（普通块 ``` 或 json 块 ```json）
 *   3. 尝试定位第一个 `{` 和最后一个 `}` 提取裸 JSON
 *   4. 回退到直接 JSON.parse（原始字符串）
 *
 * LLM 输出偶发夹杂开场白（"以下是结果："）、尾缀（"。\n\n```"）或 markdown 包裹，
 * 该函数确保这些噪声不影响 JSON 解析。
 */
function extractJSON(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  // 策略 1：直接解析（最快路径，适用于纯净 JSON 输出）
  try {
    JSON.parse(trimmed)
    return trimmed // 合法 JSON，直接返回
  } catch {
    // 不合法，尝试提取
  }

  // 策略 2：提取 markdown 代码块内容（```json ... ``` 或 ``` ... ```）
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch?.[1]) {
    const inner = codeBlockMatch[1].trim()
    if (inner) {
      try {
        JSON.parse(inner)
        return inner
      } catch {
        // 代码块内也不是合法 JSON，继续尝试
      }
    }
  }

  // 策略 3：定位第一个 `{` 和最后一个 `}` 提取
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1)
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // 提取的子串也不是合法 JSON
    }
  }

  return null
}

/**
 * 安全解析 JSON 字符串
 *
 * - 不抛异常，返回 discriminated union
 * - 先尝试直接解析，再尝试从 markdown 代码块或文本中提取 JSON
 * - 失败时返回可读 error 文案，供 runAgent 追加到对话中提示 LLM 修正
 */
export function safeParseJSON(raw: string): JsonParseOk | JsonParseErr {
  const extracted = extractJSON(raw)
  if (extracted === null) {
    return { ok: false, error: '响应为空字符串' }
  }
  try {
    return { ok: true, value: JSON.parse(extracted) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 把 ZodError 格式化为人类可读的单行字符串（用于追加到对话提示 LLM 修正）。
 *
 * 只取前若干条 issue 避免消息过长。
 */
export function formatZodIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
  limit = 5,
): string {
  const shown = issues.slice(0, limit)
  const lines = shown.map((i) => {
    const path = i.path.length > 0 ? i.path.join('.') : '(root)'
    return `  - [${path}] ${i.message}`
  })
  const more = issues.length > limit ? `\n  …（另有 ${issues.length - limit} 条错误已省略）` : ''
  return lines.join('\n') + more
}
