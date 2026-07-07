/**
 * SenseNova Provider 工厂
 *
 * SenseNova（商汤大模型开放平台）提供 OpenAI 兼容协议，鉴权用
 * `Authorization: Bearer <apiKey>`。本仓库当前用作 `deepseek-v4-flash` 的
 * 默认测试供应商（M2.5 后接入了 sensenova 通道，见 docs/M2.5-Review.md）。
 *
 * baseURL **带 `/v1`**（与原生 DeepSeek 不同），完整地址为：
 *   https://token.sensenova.cn/v1
 *
 * 该通道下可用模型：
 *   - `deepseek-v4-flash`：快速模型（默认测试用，ping / import / feedback / eval）
 *   - 其他 SenseNova 托管模型按平台文档为准
 *
 * 与 `provider='deepseek'` 的关系：
 *   - 同一个模型（如 deepseek-v4-flash）可由多家供应商托管，模型权重一致但
 *     计费、限流、延迟可能不同
 *   - ProviderKind 仅决定 baseURL 与 API key 来源；模型 ID 由 LLMConfig.model 决定
 *   - 用户在 Settings 中可切换 provider='deepseek'（原生）或 provider='sensenova'（本通道）
 */

import { OpenAICompatProvider } from './openai-compat'
import type { LLMConfig, LLMProvider } from './types'

/** SenseNova 默认配置 */
export const sensenovaDefaults = {
  baseURL: 'https://token.sensenova.cn/v1',
  model: 'deepseek-v4-flash',
  temperature: 0.7,
} as const

/**
 * 创建 SenseNova Provider
 *
 * @param config 用户提供的配置（apiKey 必填，其他字段可覆盖默认）
 */
export function createSenseNovaProvider(config: LLMConfig): LLMProvider {
  if (config.provider !== 'sensenova') {
    throw new Error(
      `createSenseNovaProvider called with provider='${config.provider}', expected 'sensenova'`,
    )
  }
  return new OpenAICompatProvider({
    ...sensenovaDefaults,
    ...config,
  })
}
