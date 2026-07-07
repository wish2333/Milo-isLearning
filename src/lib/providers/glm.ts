/**
 * GLM Coding Plan Provider 工厂
 *
 * 对应 docs/Technical-Specification.md §3.2 + docs/Prompt-Engineering.md §2.2.3/§2.2.4。
 *
 * **本仓库默认走 GLM Coding Plan 端点，不是公开 GLM 端点。**
 * 两者的区别仅在 baseURL 路径：
 *   - Coding Plan：`https://open.bigmodel.cn/api/coding/paas/v4`
 *   - 公开 GLM：  `https://open.bigmodel.cn/api/paas/v4`
 * 同一份 API Key 通过不同 baseURL 路由到不同计费来源。
 * ProviderKind 仍为 `'glm'`，是否使用 Coding Plan 完全由 `LLMConfig.baseURL` 决定。
 *
 * 模型 ID（Coding Plan 与公开端点通用）：
 *   - `glm-5.2`：旗舰模型（Mission/Quiz/Feynman 编译主体）
 *   - `glm-5-turbo`：快速模型（Import/Chunk/Feedback，P95 ≤ 1.5s）
 *   - 旧 ID（`glm-4-plus` / `glm-4-flash` / `glm-4.7`）已过时
 *
 * GLM 特殊行为（见 openai-compat.ts parseChatResponse）：
 *   - thinking 模式开启时 `content` 可能为空，实际答案在 `reasoning_content`
 *   - 默认 temperature=0.95，JSON 任务必须显式覆盖为 0.1-0.7
 *   - `enable_thinking` 通过 `extra_body` 控制（M2 范围内由 Pipeline 层注入）
 */

import { OpenAICompatProvider } from './openai-compat'
import type { LLMConfig, LLMProvider } from './types'

/**
 * GLM Coding Plan 默认配置
 *
 * 默认走 Coding Plan 端点。若需切换到公开端点，覆盖 `baseURL` 为
 * `https://open.bigmodel.cn/api/paas/v4`（去掉 `/coding`）。
 */
export const glmDefaults = {
  baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
  model: 'glm-5.2',
  temperature: 0.7,
} as const

/**
 * 创建 GLM Provider（默认 Coding Plan 端点）
 *
 * @param config 用户提供的配置（apiKey 必填，其他字段可覆盖默认）
 */
export function createGLMProvider(config: LLMConfig): LLMProvider {
  if (config.provider !== 'glm') {
    throw new Error(
      `createGLMProvider called with provider='${config.provider}', expected 'glm'`,
    )
  }
  return new OpenAICompatProvider({
    ...glmDefaults,
    ...config,
  })
}

