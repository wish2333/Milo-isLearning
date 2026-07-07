/**
 * LLM Provider 工厂入口
 *
 * 对应 docs/Technical-Specification.md §3.3。
 *
 * 用法：
 *   ```ts
 *   import { createProvider } from '@/lib/providers'
 *   const provider = createProvider({ provider: 'deepseek', apiKey, model: 'deepseek-v4-flash' })
 *   const result = await provider.chat({ messages })
 *   ```
 *
 * 所有调用方（Compiler / Feedback / FeynmanEval）只依赖此工厂与 LLMProvider 接口，
 * 不直接引用具体供应商实现。
 */

import { createDeepSeekProvider } from './deepseek'
import { createGLMProvider } from './glm'
import type { LLMConfig, LLMProvider, ProviderKind } from './types'

export { ProviderError } from './types'
export { OpenAICompatProvider } from './openai-compat'
export { createDeepSeekProvider, deepseekDefaults } from './deepseek'
export { createGLMProvider, glmDefaults } from './glm'
export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  LLMConfig,
  LLMProvider,
  PingResult,
  ProviderErrorKind,
  ProviderKind,
} from './types'

/**
 * 根据 LLMConfig.provider 创建对应 Provider 实例
 *
 * @throws Error 当 provider 为未知值
 */
export function createProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'deepseek':
      return createDeepSeekProvider(config)
    case 'glm':
      return createGLMProvider(config)
    default: {
      // exhaustiveness check：编译期保证 ProviderKind 全覆盖
      const exhaustive: never = config.provider
      throw new Error(
        `Unsupported provider: ${exhaustive as string} (known: deepseek, glm)`,
      )
    }
  }
}

/**
 * 检查某 ProviderKind 是否在 MVP 支持列表中（设置页 / 校验用）
 */
export function isSupportedProvider(kind: unknown): kind is ProviderKind {
  return kind === 'deepseek' || kind === 'glm'
}
