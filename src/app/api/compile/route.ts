/**
 * POST /api/compile -- SSE streaming endpoint for the Knowledge Compiler pipeline.
 *
 * M3-Plan SS-W5. Wraps `compileMarkdown` async generator into an SSE stream.
 *
 * Protocol:
 *   - Request:  POST { rawMarkdown: string, config: CompileConfig }
 *   - Response: text/event-stream, each event formatted as:
 *       event: {kind}\ndata: {JSON}\n\n
 *
 * Constraints:
 *   - Node runtime only (Edge 30s timeout cannot handle P95 <= 3min compiles)
 *   - No persistence (NFR-S1: user data stays client-side except LLM API calls)
 *   - No retry at this layer (NFR-R2: single-agent retry is handled inside pipeline)
 */

import type { NextRequest } from 'next/server'
import {
  compileMarkdown,
  type CompileConfig,
  type CompileEvent,
  type CompileErrorPayload,
} from '@/lib/compiler/pipeline'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  console.info('[api/compile] POST 请求到达')
  const startTime = Date.now()

  // --- Parse & validate request body ---
  let body: unknown
  try {
    body = await req.json()
    console.info('[api/compile] 请求体解析完成')
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (
    body === null ||
    typeof body !== 'object' ||
    !('rawMarkdown' in body) ||
    !('config' in body)
  ) {
    return Response.json({ error: 'Missing required fields: rawMarkdown, config' }, { status: 400 })
  }

  const { rawMarkdown, config } = body as Record<string, unknown>

  if (typeof rawMarkdown !== 'string') {
    return Response.json({ error: 'rawMarkdown must be a string' }, { status: 400 })
  }

  if (config === null || typeof config !== 'object') {
    return Response.json({ error: 'config must be an object' }, { status: 400 })
  }

  console.info('[api/compile] 参数校验通过，准备创建 SSE stream')

  // --- Build SSE stream ---
  const encoder = new TextEncoder()

  function formatSSE(event: CompileEvent): string {
    return `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`
  }

  let eventCount = 0

  const stream = new ReadableStream({
    async start(controller) {
      console.info('[api/compile] ReadableStream.start() 开始执行')
      try {
        for await (const event of compileMarkdown(rawMarkdown, config as CompileConfig)) {
          eventCount++
          console.info(
            `[api/compile] enqueue #${eventCount}: kind=${event.kind}`,
            event.kind === 'stage_enter' ? `stage=${event.stage}` : '',
          )
          controller.enqueue(encoder.encode(formatSSE(event)))
        }
        console.info(
          `[api/compile] 编译流结束，共 ${eventCount} 个事件，耗时 ${Date.now() - startTime}ms`,
        )
      } catch (err: unknown) {
        console.error('[api/compile] 编译异常:', err instanceof Error ? err.message : String(err))
        // Catch-all: translate unknown exceptions into a CompileError-shaped SSE event
        // so the client always receives a parseable error payload
        const message = err instanceof Error ? err.message : 'An unexpected error occurred'

        const fallbackError: CompileErrorPayload = {
          stage: 'unknown',
          code: 'unknown',
          message,
          retryable: true,
        }

        const fallbackEvent: CompileEvent = {
          kind: 'error',
          error: fallbackError,
        }

        controller.enqueue(encoder.encode(formatSSE(fallbackEvent)))
      } finally {
        console.info('[api/compile] 关闭 stream')
        controller.close()
      }
    },
  })

  console.info('[api/compile] 返回 Response 对象')

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
