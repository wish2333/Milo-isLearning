/**
 * POST /api/ping — LLM 连接健康检查
 *
 * 对应 docs/M6-Plan.md W7 Settings 页。
 *
 * 协议：
 *   - Request:  POST { config: LLMConfig }
 *   - Response: PingResult { ok, latencyMs, message }
 *
 * 在服务端创建 Provider 实例并调用 ping()，避免浏览器 CORS 限制。
 */

import type { NextRequest } from 'next/server'

import { createProvider } from '@/lib/providers'
import type { LLMConfig } from '@/lib/providers/types'

export const runtime = 'nodejs'

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

  const { config } = body as { config?: LLMConfig }

  if (!config) {
    return Response.json({ error: 'Missing required field: config' }, { status: 400 })
  }

  if (!config.apiKey || !config.model) {
    return Response.json({
      ok: false,
      latencyMs: 0,
      message: 'apiKey 和 model 不能为空',
    })
  }

  try {
    const provider = createProvider(config)
    const result = await provider.ping()
    return Response.json(result)
  } catch (err: unknown) {
    return Response.json({
      ok: false,
      latencyMs: 0,
      message: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
