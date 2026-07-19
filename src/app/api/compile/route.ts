/**
 * POST /api/compile -- SSE streaming endpoint for the Knowledge Compiler pipeline.
 *
 * M3-Plan SS-W5. Wraps `compileMarkdown` async generator into an SSE stream.
 *
 * Protocol:
 *   - Request:  POST { rawMarkdown: string, config: CompileConfig, sessionId?: string, resumeFrom?: CompileStage }
 *   - Response: text/event-stream, each event formatted as:
 *       event: {kind}\ndata: {JSON}\n\n
 *
 * Constraints:
 *   - Node runtime only (Edge 30s timeout cannot handle P95 <= 3min compiles)
 *   - No persistence (NFR-S1: user data stays client-side except LLM API calls)
 *   - No retry at this layer (NFR-R2: single-agent retry is handled inside pipeline)
 *   - AbortSignal: client disconnect triggers generator.return() for early cleanup (PB.2 F04)
 */

import 'server-only'

import type { NextRequest } from 'next/server'
import {
  compileMarkdown,
  compileTopicWithExpand,
  compileWithExpand,
  type CompileConfig,
  type CompileErrorPayload,
  type CompileEvent,
  type CompileOptions,
  type CompileStage,
} from '@/lib/compiler/pipeline'
import { expandJobLibrary } from '@/lib/persistence/expand-job-library'
import { isStorageEnabled } from '@/lib/persistence/server/config'
import { APP_MODE } from '@/lib/runtime/app-mode'
import { getDb } from '@/lib/persistence/server/db-singleton'
import { ServerSQLiteRepository } from '@/lib/persistence/server/sqlite-repository'
import { saveCheckpoint, getResumptionData } from '@/lib/persistence/server/compile-checkpoint'

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

  if (body === null || typeof body !== 'object' || !('config' in body)) {
    return Response.json({ error: 'Missing required field: config' }, { status: 400 })
  }

  const parsedBody = body as Record<string, unknown>

  // --- Determine compile mode ---
  const compileMode =
    typeof parsedBody.compileMode === 'string' ? parsedBody.compileMode : 'markdown'
  const isExpandMode = compileMode === 'expand'
  const isTopicExpandMode = compileMode === 'topic-expand'

  // Mode-specific field validation
  if (isTopicExpandMode) {
    if (APP_MODE !== 'production' || !isStorageEnabled) {
      return Response.json(
        { error: 'topic-expand is only available in production storage mode' },
        { status: 404 },
      )
    }
    if (typeof parsedBody.sourceHash !== 'string' || parsedBody.sourceHash.length === 0) {
      return Response.json(
        { error: 'Missing required field: sourceHash (required in topic-expand mode)' },
        { status: 400 },
      )
    }
    if (!Array.isArray(parsedBody.items) || parsedBody.items.length === 0) {
      return Response.json(
        { error: 'items must be a non-empty array (required in topic-expand mode)' },
        { status: 400 },
      )
    }
    for (const [index, item] of parsedBody.items.entries()) {
      if (
        item === null ||
        typeof item !== 'object' ||
        typeof (item as Record<string, unknown>).source !== 'string' ||
        typeof (item as Record<string, unknown>).moduleIndex !== 'number'
      ) {
        return Response.json(
          { error: `items[${index}] must contain source and numeric moduleIndex` },
          { status: 400 },
        )
      }
    }
  } else if (isExpandMode) {
    if (typeof parsedBody.topic !== 'string' || parsedBody.topic.length === 0) {
      return Response.json(
        { error: 'Missing required field: topic (required in expand mode)' },
        { status: 400 },
      )
    }
  } else {
    if (typeof parsedBody.rawMarkdown !== 'string') {
      return Response.json(
        { error: 'Missing required field: rawMarkdown (required in markdown mode)' },
        { status: 400 },
      )
    }
  }

  const { config } = parsedBody as { config: unknown }

  if (config === null || typeof config !== 'object') {
    return Response.json({ error: 'config must be an object' }, { status: 400 })
  }

  // Extract mode-specific variables with type guards
  const rawMarkdown = typeof parsedBody.rawMarkdown === 'string' ? parsedBody.rawMarkdown : ''
  const topic = typeof parsedBody.topic === 'string' ? parsedBody.topic : ''
  const constraints =
    typeof parsedBody.constraints === 'string' ? parsedBody.constraints : undefined

  const topicExpandSourceHash =
    typeof parsedBody.sourceHash === 'string' ? parsedBody.sourceHash : undefined

  const rawTopicExpandItems = isTopicExpandMode ? (parsedBody.items as unknown[]) : []
  const topicExpandItems = isTopicExpandMode
    ? rawTopicExpandItems.map((item, index) => {
        const parsedItem = item as Record<string, unknown>
        return {
          itemId: typeof parsedItem.itemId === 'string' ? parsedItem.itemId : undefined,
          moduleIndex: typeof parsedItem.moduleIndex === 'number' ? parsedItem.moduleIndex : index,
          source: parsedItem.source as string,
        }
      })
    : []

  let topicExpandJobId: string | undefined
  let topicExpandRepository: ServerSQLiteRepository | undefined
  if (isTopicExpandMode && topicExpandSourceHash) {
    try {
      topicExpandRepository = new ServerSQLiteRepository(getDb())
      const requestedJobId = typeof parsedBody.jobId === 'string' ? parsedBody.jobId : undefined
      const existingJob = requestedJobId
        ? expandJobLibrary.get(requestedJobId, topicExpandRepository)
        : null
      if (requestedJobId && !existingJob) {
        return Response.json({ error: 'expand_job_not_found' }, { status: 404 })
      }
      if (existingJob && existingJob.sourceHash !== topicExpandSourceHash) {
        return Response.json({ error: 'source_changed', jobId: existingJob.jobId }, { status: 409 })
      }
      const job =
        existingJob ??
        expandJobLibrary.create(
          {
            sourceHash: topicExpandSourceHash,
            topicId: typeof parsedBody.topicId === 'string' ? parsedBody.topicId : undefined,
            constraints,
            items: topicExpandItems,
          },
          topicExpandRepository,
        )
      topicExpandJobId = job.jobId
    } catch {
      return Response.json({ error: 'expand_job_storage_unavailable' }, { status: 503 })
    }
  }

  // --- Build CompileOptions (PB.2 F04) ---
  const compileOptions: CompileOptions = {}

  if (typeof parsedBody.sessionId === 'string' && parsedBody.sessionId.length > 0) {
    compileOptions.sessionId = parsedBody.sessionId
  }

  if (
    !isTopicExpandMode &&
    typeof parsedBody.resumeFrom === 'string' &&
    parsedBody.resumeFrom.length > 0 &&
    APP_MODE === 'production' &&
    isStorageEnabled
  ) {
    compileOptions.resumeFrom = parsedBody.resumeFrom as CompileStage
    compileOptions.sessionId = parsedBody.sessionId as string

    // 从 staging 表加载 resume checkpoint 数据
    try {
      const db = getDb()
      const { lastStage, checkpoints } = getResumptionData(db, compileOptions.sessionId)
      if (lastStage) {
        compileOptions.checkpointData = checkpoints as unknown as CompileOptions['checkpointData']
      }
    } catch {
      // DB 不可用时静默降级（checkpoint 是增强功能，不应阻断编译）
      console.warn('[api/compile] 加载 resume checkpoint 失败，将从头编译')
      compileOptions.resumeFrom = undefined
    }
  }

  // 注入 checkpoint 写入回调（production + storage 可用时）
  if (
    !isTopicExpandMode &&
    APP_MODE === 'production' &&
    isStorageEnabled &&
    compileOptions.sessionId
  ) {
    try {
      const db = getDb()
      const sessionId = compileOptions.sessionId
      compileOptions.writeCheckpoint = (stage, artifact, usage) => {
        try {
          saveCheckpoint(db, sessionId, stage as CompileStage, artifact, usage)
        } catch {
          // checkpoint 写入失败不应阻断编译
          console.warn(`[api/compile] checkpoint 写入失败: stage=${stage}`)
        }
      }
    } catch {
      // DB 不可用时静默降级
    }
  }

  console.info('[api/compile] 参数校验通过，准备创建 SSE stream')

  // --- Build SSE stream with AbortSignal support ---
  const signal = req.signal
  const encoder = new TextEncoder()

  function formatSSE(event: CompileEvent): string {
    return `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`
  }

  let eventCount = 0

  const stream = new ReadableStream({
    async start(controller) {
      console.info('[api/compile] ReadableStream.start() 开始执行')
      const generator: AsyncGenerator<CompileEvent, void, unknown> = (
        isTopicExpandMode
          ? compileTopicWithExpand(config as CompileConfig, {
              jobId: topicExpandJobId!,
              sourceHash: topicExpandSourceHash!,
              constraints,
              repository: topicExpandRepository,
            })
          : isExpandMode
            ? compileWithExpand(topic, constraints, config as CompileConfig, compileOptions)
            : compileMarkdown(rawMarkdown, config as CompileConfig, compileOptions)
      ) as AsyncGenerator<CompileEvent, void, unknown>
      try {
        for await (const event of generator) {
          // PB.2: 客户端断开时终止 pipeline
          if (signal.aborted) {
            console.info('[api/compile] 客户端断开 (abort)，终止 pipeline')
            await generator.return(undefined)
            break
          }
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
