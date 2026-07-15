/**
 * POST /api/feynman-eval — 费曼最终输出评分 API
 *
 * 对应 docs/M4-M5-Plan.md W7 / PRD §7.9 / FR-06 AC3-8。
 *
 * 协议：
 *   - Request:  POST { finalPrompt, rubric, userOutput, llmConfig }
 *   - Response: { score, rubricResults, gaps, sampleAnswer }
 *
 * 评分策略（Tech Spec §5.5）：
 *   - "触及关键点的核心含义即视为 hit"（宽容评分）
 *   - score = rubric 各点得分之和（full=满分, partial=半分, none=0）
 *
 * 注意：
 *   - Node runtime（Feynman-Eval Agent 需调 LLM）
 *   - llmConfig 包含 apiKey，从客户端 settings-store 传入
 */

import type { NextRequest } from 'next/server'

import { runAgent } from '@/lib/compiler/agents/_runner'
import { feynmanEvalSchema } from '@/lib/compiler/schemas/feynman-eval'
import type { FeynmanEvalOutput } from '@/lib/compiler/schemas/feynman-eval'
import { createProvider } from '@/lib/providers'
import { getEnvLLMConfig } from '@/lib/providers/env-fallback'
import type { LLMConfig } from '@/lib/providers/types'
import { APP_MODE } from '@/lib/runtime/app-mode'
import { isStorageEnabled } from '@/lib/persistence/server/config'
import { insertEvents } from '@/lib/persistence/server/events-repo'
import { getDb } from '@/lib/persistence/server/db-singleton'

export const runtime = 'nodejs'

interface FeynmanEvalRequestBody {
  /** 费曼最终输出提示词（引导用户写什么） */
  finalPrompt: string
  /** 评分标准（3-5 条） */
  rubric: string[]
  /** 用户提交的开放输出文本 */
  userOutput: string
  llmConfig: LLMConfig
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body === null || typeof body !== 'object') {
    return Response.json({ error: 'Request body must be an object' }, { status: 400 })
  }

  const { finalPrompt, rubric, userOutput, llmConfig } = body as Partial<FeynmanEvalRequestBody>

  if (typeof finalPrompt !== 'string' || !Array.isArray(rubric) || typeof userOutput !== 'string') {
    return Response.json(
      { error: 'Missing required fields: finalPrompt, rubric, userOutput' },
      { status: 400 },
    )
  }

  // 客户端未携带 llmConfig 时（展示模式），fallback 到服务端环境变量
  const envConfig = llmConfig ? null : getEnvLLMConfig()
  const config = llmConfig ?? envConfig
  if (!config) {
    return Response.json(
      { error: 'LLM 配置不可用：请在设置页配置，或在服务端 .env.local 中设置 DEEPSEEK_API_KEY' },
      { status: 400 },
    )
  }

  // PA.7: env fallback 埋点 — 服务端直接写入 SQLite，不走客户端 track
  if (!llmConfig && envConfig && isStorageEnabled) {
    try {
      insertEvents(getDb(), [
        {
          name: 'env_fallback_used',
          props: { route: 'feynman-eval', provider: envConfig.provider, model: envConfig.model },
          app_mode: APP_MODE,
          occurred_at: Date.now(),
        },
      ])
    } catch {
      // 遥测失败不阻塞 API 响应
    }
  }

  try {
    const provider = createProvider(config)

    const { data: output } = await runAgent(
      'feynman-eval',
      {
        finalPrompt,
        rubric,
        userOutput,
      },
      provider,
      feynmanEvalSchema,
    )

    // feynman-eval mapper is identity (already camelCase)
    const result = output as FeynmanEvalOutput

    return Response.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Feynman evaluation failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
