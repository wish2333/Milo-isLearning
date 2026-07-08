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
import type { LLMConfig } from '@/lib/providers/types'
import type { Quiz } from '@/types/domain'

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

  if (!quiz || typeof userAnswer !== 'string' || !llmConfig) {
    return Response.json(
      { error: 'Missing required fields: quiz, userAnswer, llmConfig' },
      { status: 400 },
    )
  }

  try {
    const provider = createProvider(llmConfig)

    const output = await runAgent(
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
