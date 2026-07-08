/**
 * POST /api/regenerate — 答错重试题目重新生成 API
 *
 * 对应 docs/M4-M5-Plan.md W5 / FR-04。
 *
 * 协议：
 *   - Request:  POST { placeholder, concept, moduleContext, originalQuiz?, llmConfig }
 *   - Response: { quiz: Quiz }
 *
 * 策略（Tech Spec §5.3 / W5 决策 4.4）：
 *   - 使用单题 quiz Agent 生成同类型新题（更换 stem + 干扰项）
 *   - originalQuiz 非空时，Prompt 注入"以下干扰项已用过，必须更换"
 *   - 保持同 conceptId / ladderLevel / interactionType / expressionLevel
 *
 * 注意：
 *   - Node runtime（Quiz Agent 需调 LLM）
 *   - llmConfig 包含 apiKey，从客户端 settings-store 传入
 */

import type { NextRequest } from 'next/server'

import { runAgent } from '@/lib/compiler/agents/_runner'
import { assembleQuiz } from '@/lib/compiler/agents/mappers'
import { quizSchema } from '@/lib/compiler/schemas/quiz'
import type { QuizAgentOutput } from '@/lib/compiler/schemas/quiz'
import { createProvider } from '@/lib/providers'
import type { LLMConfig } from '@/lib/providers/types'
import type { Concept, Quiz } from '@/types/domain'

export const runtime = 'nodejs'

interface RegenerateRequestBody {
  /** Quiz 占位符（来自 mission schema 的 slot 元数据） */
  placeholder: {
    id: string
    conceptId: string
    ladderLevel: 1 | 2 | 3
    expressionLevel: 1 | 2 | 3
    interactionType: 'choice' | 'sorting' | 'fill_blank'
  }
  /** 所属 Concept */
  concept: Concept
  /** Module 上下文（title + intro） */
  moduleContext: { title: string; intro: string }
  /** retry 场景：原题（用于避免重复干扰项），首次生成为 null */
  originalQuiz?: Quiz | null
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

  const { placeholder, concept, moduleContext, originalQuiz, llmConfig } =
    body as Partial<RegenerateRequestBody>

  if (!placeholder || !concept || !moduleContext || !llmConfig) {
    return Response.json(
      { error: 'Missing required fields: placeholder, concept, moduleContext, llmConfig' },
      { status: 400 },
    )
  }

  try {
    const provider = createProvider(llmConfig)

    const output = await runAgent(
      'quiz',
      {
        placeholder,
        concept,
        moduleContext,
        originalQuiz: originalQuiz ?? null,
      },
      provider,
      quizSchema,
    )

    const quizOutput = output as QuizAgentOutput
    const quiz = assembleQuiz(quizOutput.quiz)

    return Response.json({ quiz })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Quiz regeneration failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
