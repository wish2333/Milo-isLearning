/**
 * 服务端环境变量 fallback — 当客户端未携带 llmConfig 时构造默认配置
 *
 * 用于展示模式部署：客户端无 alc:settings，API 路由从 process.env 读取。
 *
 * 复用 /api/env-config/route.ts 的环境变量映射逻辑。
 * 安全约束：apiKey 仅从 process.env 读取，不落盘、不日志。
 */

import type { LLMConfig, ProviderKind } from './types'

const PROVIDER_DEFAULT_BASE_URL: Record<ProviderKind, string> = {
  deepseek: 'https://api.deepseek.com',
  glm: 'https://open.bigmodel.cn/api/coding/paas/v4',
  'openai-compat': '',
}

/**
 * 从服务端环境变量构造 LLMConfig。
 * 返回 null 表示环境变量未配置（无法 fallback）。
 */
export function getEnvLLMConfig(): LLMConfig | null {
  const provider = (process.env.DEFAULT_LLM_PROVIDER ?? 'deepseek') as ProviderKind
  const model = process.env.DEFAULT_LLM_MODEL ?? 'deepseek-chat'

  const apiKeyMap: Record<ProviderKind, string | null> = {
    deepseek: process.env.DEEPSEEK_API_KEY ?? null,
    glm: process.env.GLM_API_KEY ?? null,
    'openai-compat': process.env.OPENAI_COMPAT_API_KEY ?? null,
  }

  const apiKey = apiKeyMap[provider]
  if (!apiKey) return null

  const baseURLByProvider: Record<ProviderKind, string | undefined> = {
    deepseek: process.env.DEEPSEEK_BASE_URL,
    glm: process.env.GLM_BASE_URL,
    'openai-compat': process.env.OPENAI_COMPAT_BASE_URL,
  }
  const baseURL = baseURLByProvider[provider] ?? PROVIDER_DEFAULT_BASE_URL[provider]

  return { provider, apiKey, model, baseURL }
}
