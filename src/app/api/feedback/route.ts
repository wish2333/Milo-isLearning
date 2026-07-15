/**
 * POST /api/feedback — 即时反馈 API
 *
 * 对应 docs/M4-M5-Plan.md W5 / PRD §7.8 / FR-04。
 *
 * 协议：
 *   - Request:  POST { quiz, userAnswer, attemptInfo?, llmConfig }
 *   - Response: { score, gaps, nextAction, feedbackText }
 *
 * 性能要求（FR-03 AC6）：P95 ≤ 1.5s
 *
 * 注意：
 *   - Node runtime（Feedback Agent 需调 LLM）
 *   - llmConfig 包含 apiKey，从客户端 settings-store 传入
 *   - NFR-S1：用户数据不落服务端，仅透传给 LLM API
 */

import type { NextRequest } from 'next/server'

import { runAgent } from '@/lib/compiler/agents/_runner'
import { mapFeedback } from '@/lib/compiler/agents/mappers'
import { feedbackSchema } from '@/lib/compiler/schemas/feedback'
import { createProvider } from '@/lib/providers'
import { getEnvLLMConfig } from '@/lib/providers/env-fallback'
import type { LLMConfig } from '@/lib/providers/types'
import type { Quiz } from '@/types/domain'
import { APP_MODE } from '@/lib/runtime/app-mode'
import { isStorageEnabled } from '@/lib/persistence/server/config'
import { insertEvents } from '@/lib/persistence/server/events-repo'
import { getDb } from '@/lib/persistence/server/db-singleton'

export const runtime = 'nodejs'

interface FeedbackRequestBody {
  quiz: Quiz
  userAnswer: string
  attemptInfo?: {
    attemptVersion: number
    consecutiveFailures: number
  }
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

  const { quiz, userAnswer, attemptInfo, llmConfig } = body as Partial<FeedbackRequestBody>

  if (!quiz || typeof userAnswer !== 'string') {
    return Response.json({ error: 'Missing required fields: quiz, userAnswer' }, { status: 400 })
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
          props: { route: 'feedback', provider: envConfig.provider, model: envConfig.model },
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
      'feedback',
      {
        quiz,
        userAnswer,
        attemptInfo: attemptInfo ?? { attemptVersion: 0, consecutiveFailures: 0 },
      },
      provider,
      feedbackSchema,
    )

    const result = mapFeedback(output)

    return Response.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Feedback evaluation failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
