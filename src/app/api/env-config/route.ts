/**
 * GET /api/env-config — 从 .env.local 读取 LLM 配置
 *
 * 对应 docs/dev-guide.md 首次配置自动化。
 *
 * Next.js 自动加载 .env.local 到 process.env，此端点在服务端读取
 * 并返回给前端，让 bun run dev 启动后无需手动在 Settings 页重复输入。
 *
 * 协议：
 *   - Response: { config: LLMConfig | null }
 *
 * 环境变量映射：
 *   DEFAULT_LLM_PROVIDER  → provider (默认 sensenova)
 *   DEFAULT_LLM_MODEL     → model (默认 deepseek-v4-flash)
 *   SENSENOVA_API_KEY / DEEPSEEK_API_KEY / GLM_API_KEY → apiKey
 *   *_BASE_URL            → baseURL (可选覆盖)
 */

import type { LLMConfig, ProviderKind } from '@/lib/providers/types'

export const runtime = 'nodejs'

/** Provider 默认 baseURL（与 providers/*.ts 中的默认值一致） */
const PROVIDER_DEFAULT_BASE_URL: Record<ProviderKind, string> = {
  deepseek: 'https://api.deepseek.com',
  glm: 'https://open.bigmodel.cn/api/coding/paas/v4',
  sensenova: 'https://token.sensenova.cn/v1',
}

/**
 * 读取所有供应商的 API Key
 */
function readAllApiKeys(): Record<ProviderKind, string | null> {
  return {
    deepseek: process.env.DEEPSEEK_API_KEY ?? null,
    glm: process.env.GLM_API_KEY ?? null,
    sensenova: process.env.SENSENOVA_API_KEY ?? null,
  }
}

export async function GET() {
  const allApiKeys = readAllApiKeys()
  const provider = (process.env.DEFAULT_LLM_PROVIDER ?? 'sensenova') as ProviderKind
  const model = process.env.DEFAULT_LLM_MODEL ?? 'deepseek-v4-flash'

  const apiKey = allApiKeys[provider]

  // API Key 为空 → 无法编译，返回 null
  if (!apiKey) {
    return Response.json({ config: null, apiKeys: allApiKeys })
  }

  // 可选的 baseURL 覆盖
  const baseURLByProvider: Record<ProviderKind, string | undefined> = {
    deepseek: process.env.DEEPSEEK_BASE_URL,
    glm: process.env.GLM_BASE_URL,
    sensenova: process.env.SENSENOVA_BASE_URL,
  }
  const baseURLOverride = baseURLByProvider[provider]
  const baseURL = baseURLOverride ?? PROVIDER_DEFAULT_BASE_URL[provider]

  const config: LLMConfig = {
    provider,
    apiKey,
    model,
    baseURL,
  }

  return Response.json({ config, apiKeys: allApiKeys })
}
