/**
 * OpenAI 兼容 Provider 工厂
 *
 * 适配任意兼容 OpenAI Chat Completions API 的端点：
 * OpenRouter / Together AI / Groq / 本地 Ollama / LM Studio 等。
 *
 * 不预设 baseURL 和 model — 用户必须通过 Settings 或环境变量提供。
 */

import { OpenAICompatProvider } from './openai-compat'
import type { LLMConfig, LLMProvider } from './types'

/** OpenAI 兼容供应商默认配置。不预设 baseURL 和 model。 */
export const openaiCompatDefaults = {
  temperature: 0.7,
} as const

/**
 * 创建 OpenAI 兼容 Provider。
 *
 * @param config 用户提供的配置（apiKey + baseURL + model 均必填）
 * @throws Error 当 baseURL 缺失
 */
export function createOpenAICompatProvider(config: LLMConfig): LLMProvider {
  if (config.provider !== 'openai-compat') {
    throw new Error(
      `createOpenAICompatProvider called with provider='${config.provider}', expected 'openai-compat'`,
    )
  }
  if (!config.baseURL) {
    throw new Error('OpenAI 兼容供应商必须提供 baseURL（在 Settings 中配置）')
  }
  return new OpenAICompatProvider({
    ...openaiCompatDefaults,
    ...config,
  })
}
