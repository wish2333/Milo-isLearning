/**
 * Prompt 构建器：把展开后的模板 + 输入变量 → ChatMessage[]
 *
 * 对应 docs/Prompt-Engineering.md §4.3 与 docs/Technical-Specification.md §4.4。
 *
 * 职责：
 *   1. 调 loader 加载已展开（shared + schema）的模板
 *   2. 按 `## System` / `## User` 切分为 system / user 两条消息
 *   3. 白名单变量替换：仅替换 input 中显式提供的 `{key}`，
 *      保护 _shared/distractor-rules.md 里的 {中文} 示例文本不被误伤
 *
 * 不做的事（由 _runner.ts 负责）：
 *   - 调用 LLM、重试、Zod 校验
 */
import type { ChatMessage } from '@/lib/providers/types'
import type { AgentKind } from '@/lib/compiler/schemas'

import { loadExpandedTemplate } from './loader'

/** buildPrompt 的输入变量表。key 即模板中的 `{key}` 占位符名（ASCII 标识符）。 */
export type PromptVariables = Record<string, unknown>

/** 模板中 system 段起始标记 */
const SYSTEM_HEADING = '## System'
/** 模板中 user 段起始标记 */
const USER_HEADING = '## User'

/**
 * 把单个变量值序列化为可嵌入模板的字符串。
 *
 * - string / number / boolean → 原始字符串
 * - object / array → JSON.stringify（缩进 2）；模板里 `{chunks}` 等占位符期望 JSON 文本
 * - null / undefined → 空串（表示"未提供"，如 quiz 的 originalQuiz 在首次作答时）
 */
function serializeVar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  // 对象/数组：JSON 文本
  return JSON.stringify(value, null, 2)
}

/**
 * 白名单变量替换：仅替换 input 中显式提供的 `{key}`。
 *
 * 安全性：因为只遍历 input 的 key（JS 标识符，ASCII），天然不会触碰
 * _shared/distractor-rules.md 里 {正确原则} / {已被取消的旧做法} 等 CJK 示例文本。
 */
function substituteVariables(template: string, input: PromptVariables): string {
  let out = template
  for (const [key, value] of Object.entries(input)) {
    // 转义 key 中的正则元字符（key 是标识符，理论上无需，但稳妥）
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\{${escaped}\\}`, 'g')
    out = out.replace(re, serializeVar(value))
  }
  return out
}

/**
 * 把已展开的模板切分为 system / user 两段文本。
 *
 * 模板结构约定（见任意 *.md）：
 *   # 标题与文档注释（frontmatter，丢弃）
 *   ## System      ← system 段开始
 *   ...
 *   ## User        ← user 段开始
 *   ...（含可能的 `## 输出 Schema` 段，并入 user 段作为输出契约重申）
 *
 * 若缺少 System 或 User 段，抛出明确错误（模板编写错误，应尽早暴露）。
 */
function splitMessages(expanded: string): { system: string; user: string } {
  const sysIdx = expanded.indexOf(SYSTEM_HEADING)
  const userIdx = expanded.indexOf(USER_HEADING)

  if (sysIdx === -1) {
    throw new Error('Prompt 模板缺少 "## System" 段')
  }
  if (userIdx === -1) {
    throw new Error('Prompt 模板缺少 "## User" 段')
  }
  if (userIdx < sysIdx) {
    throw new Error('Prompt 模板中 "## User" 出现在 "## System" 之前，顺序错误')
  }

  const system = expanded.slice(sysIdx + SYSTEM_HEADING.length, userIdx).trim()
  const user = expanded.slice(userIdx + USER_HEADING.length).trim()
  return { system, user }
}

/**
 * 构建 Agent 的聊天消息序列。
 *
 * 用法（对应 Prompt-Engineering.md §4.3）：
 * ```ts
 * const messages = buildPrompt('concept', {
 *   chunks: [{ id: 'c1', text: '...', heading: '...' }],
 *   themeHint: '',
 * })
 * const response = await provider.chat({ messages, ... })
 * ```
 *
 * @param kind  Agent 类型
 * @param input 模板变量；未提供的 `{key}` 保持原样（应避免，调用方需提供全部所需变量）
 * @returns 恰好两条消息：[{role:'system'}, {role:'user'}]
 */
export function buildPrompt(kind: AgentKind, input: PromptVariables): ChatMessage[] {
  const expanded = loadExpandedTemplate(kind)
  const substituted = substituteVariables(expanded, input)
  const { system, user } = splitMessages(substituted)
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
