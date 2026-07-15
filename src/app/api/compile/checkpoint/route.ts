import 'server-only'
import { type NextRequest, NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { APP_MODE } from '@/lib/runtime/app-mode'
import { getDb } from '@/lib/persistence/server/db-singleton'
import { saveCheckpoint } from '@/lib/persistence/server/compile-checkpoint'
import type { CompileStage } from '@/lib/compiler/pipeline/types'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 10 * 1024 * 1024 // 10 MiB（artifact 可能源码较大）

/** 解析真实 Host，处理反代转发场景 */
function resolveForwardedHost(req: NextRequest): string | null {
  const xfh = req.headers.get('x-forwarded-host')
  if (xfh) {
    const first = xfh.split(',')[0]
    if (first) return first.trim()
  }
  const forwarded = req.headers.get('forwarded')
  if (forwarded) {
    const match = /host="?([^;,\s]+)"?/i.exec(forwarded)
    if (match?.[1]) return match[1].trim()
  }
  return req.headers.get('host')
}

/** 同源校验 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const expectedHost = resolveForwardedHost(req)
  if (!expectedHost) return false
  return originHost === expectedHost
}

const VALID_STAGES: readonly string[] = [
  'import',
  'chunk',
  'concept',
  'module',
  'mission',
  'quiz',
  'challenge',
  'feynman',
]

/** 校验 stage 名合法性 */
function isValidStage(stage: unknown): stage is CompileStage {
  return typeof stage === 'string' && (VALID_STAGES as readonly unknown[]).includes(stage)
}

/**
 * POST /api/compile/checkpoint -- 保存 stage checkpoint
 *
 * Body: { sessionId: string, stage: CompileStage, artifact: unknown, usage?: { promptTokens, completionTokens } }
 * Response: 200 OK
 */
export async function POST(req: NextRequest) {
  if (APP_MODE !== 'production') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isStorageEnabled) {
    return NextResponse.json({ error: 'Storage not enabled' }, { status: 503 })
  }

  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 })
  }

  const bodyText = await req.text()
  const bodyBytes = new TextEncoder().encode(bodyText).length
  if (bodyBytes > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Body exceeds size limit' }, { status: 413 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const body = parsed as Record<string, unknown>

  if (typeof body.sessionId !== 'string' || body.sessionId.length === 0) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  if (!isValidStage(body.stage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
  }

  if (body.artifact === undefined || body.artifact === null) {
    return NextResponse.json({ error: 'Missing artifact' }, { status: 400 })
  }

  // 校验 usage 可选字段
  let usage: { promptTokens: number; completionTokens: number } | undefined
  if (body.usage !== undefined && body.usage !== null) {
    if (typeof body.usage !== 'object' || body.usage === null) {
      return NextResponse.json({ error: 'Invalid usage' }, { status: 400 })
    }
    const u = body.usage as Record<string, unknown>
    if (typeof u.promptTokens !== 'number' || typeof u.completionTokens !== 'number') {
      return NextResponse.json({ error: 'Invalid usage fields' }, { status: 400 })
    }
    usage = { promptTokens: u.promptTokens, completionTokens: u.completionTokens }
  }

  const db = getDb()
  saveCheckpoint(db, body.sessionId, body.stage, body.artifact, usage)

  return NextResponse.json({ ok: true })
}
