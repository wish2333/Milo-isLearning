/**
 * DeepSeek Provider 工厂
 *
 * 对应 docs/Technical-Specification.md §3.2 + docs/Prompt-Engineering.md §2.2.2。
 *
 * DeepSeek 完全兼容 OpenAI 协议，鉴权用 `Authorization: Bearer <apiKey>`。
 * baseURL **不带 `/v1`**（与 OpenAI 标准路径有差异）。
 *
 * 模型 ID：
 *   - `deepseek-v4-flash`：快速模型（Import/Chunk/Concept/Module/Feedback）
 *   - `deepseek-v4-pro`：强模型（Mission/Quiz/Feynman 编译主体）
 *   - 旧 ID（`deepseek-chat` / `deepseek-reasoner`）2026-07-24 退役，勿用
 *
 * V4 默认开启 thinking 模式：响应含 `reasoning_content`（CoT）+ `content`（最终答案）。
 * Provider 层只取 `content`；若 content 为空才回退到 `reasoning_content`（见 openai-compat.ts）。
 */

import { OpenAICompatProvider } from './openai-compat'
import type { LLMConfig, LLMProvider } from './types'

/** DeepSeek 默认配置（用户可在 Settings 中覆盖 apiKey / model） */
export const deepseekDefaults = {
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  temperature: 0.7,
} as const

/**
 * 创建 DeepSeek Provider
 *
 * @param config 用户提供的配置（apiKey 必填，其他字段可覆盖默认）
 */
export function createDeepSeekProvider(config: LLMConfig): LLMProvider {
  if (config.provider !== 'deepseek') {
    throw new Error(
      `createDeepSeekProvider called with provider='${config.provider}', expected 'deepseek'`,
    )
  }
  return new OpenAICompatProvider({
    ...deepseekDefaults,
    ...config,
  })
}
