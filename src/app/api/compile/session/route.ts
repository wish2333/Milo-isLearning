import 'server-only'
import { type NextRequest, NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { APP_MODE } from '@/lib/runtime/app-mode'
import { getDb } from '@/lib/persistence/server/db-singleton'
import {
  abandonSession,
  createSession,
  findActiveSession,
} from '@/lib/persistence/server/compile-checkpoint'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 64 * 1024 // 64 KiB（此路由 body 很小）

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

/**
 * POST /api/compile/session -- 创建编译 session
 *
 * Body: { sourceHash: string }
 * Response: { sessionId: string, resumed: boolean }
 */
export async function POST(req: NextRequest) {
  // Fail-closed: showcase 模式禁止写入
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

  if (typeof body.sourceHash !== 'string' || body.sourceHash.length === 0) {
    return NextResponse.json({ error: 'Missing sourceHash' }, { status: 400 })
  }

  const sourceHash = body.sourceHash

  const db = getDb()

  // 检查是否有已有的 active session 可复用（resume）
  const existingId = findActiveSession(db, sourceHash)
  if (existingId) {
    return NextResponse.json({ sessionId: existingId, resumed: true })
  }

  const sessionId = createSession(db, sourceHash)
  return NextResponse.json({ sessionId, resumed: false })
}

/**
 * DELETE /api/compile/session?sessionId=<id> -- 放弃编译 session
 *
 * Query: sessionId=string
 * Response: { ok: true }
 */
export async function DELETE(req: NextRequest) {
  if (APP_MODE !== 'production') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isStorageEnabled) {
    return NextResponse.json({ error: 'Storage not enabled' }, { status: 503 })
  }

  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 })
  }

  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId || sessionId.length === 0) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const db = getDb()
  abandonSession(db, sessionId)
  return NextResponse.json({ ok: true })
}
