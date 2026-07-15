import 'server-only'
import { type NextRequest, NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { APP_MODE } from '@/lib/runtime/app-mode'
import { getDb } from '@/lib/persistence/server/db-singleton'
import { insertEvents, type AnalyticsEventRow } from '@/lib/persistence/server/events-repo'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 50 * 1024 * 1024 // 50 MiB

/** 解析真实 Host，处理反代转发场景（Vercel / nginx / Cloudflare） */
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

/**
 * 同源校验 -- 复用 v1.0.1 /api/data/* 安全模式
 *
 * 反代场景下，Host header 可能是内部地址，
 * 而 Origin header 携带的是公网 URL。通过 X-Forwarded-Host / Forwarded
 * header 解析真实 Host，避免误判合法同源请求为跨域。
 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // 同源请求通常无 Origin header

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false // Origin 格式非法，拒绝
  }

  const expectedHost = resolveForwardedHost(req)
  if (!expectedHost) return false

  return originHost === expectedHost
}

/** 校验单个事件的结构 */
function isValidEvent(
  event: unknown,
): event is { name: string; props: unknown; occurredAt: number } {
  if (typeof event !== 'object' || event === null) return false
  const e = event as Record<string, unknown>
  return (
    typeof e.name === 'string' &&
    e.name.length > 0 &&
    typeof e.props === 'object' &&
    e.props !== null &&
    typeof e.occurredAt === 'number' &&
    isFinite(e.occurredAt)
  )
}

/**
 * POST /api/events -- 批量写入遥测事件
 *
 * 安全：
 *   1. Fail-closed: showcase 模式 -> 403
 *   2. Fail-closed: 未启用 SQLite -> 503
 *   3. Origin 同源校验
 *   4. Body 大小限制 50 MiB（byte-safe: TextEncoder）
 */
export async function POST(req: NextRequest) {
  // Fail-closed: showcase 模式禁止写入
  if (APP_MODE !== 'production') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fail-closed: 未启用 SQLite 存储
  if (!isStorageEnabled) {
    return NextResponse.json({ error: 'Storage not enabled' }, { status: 503 })
  }

  // Origin 同源校验
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 })
  }

  // 读取 body
  const bodyText = await req.text()

  // Byte-safe body 大小校验（TextEncoder 对多字节字符正确计数）
  const bodyBytes = new TextEncoder().encode(bodyText).length
  if (bodyBytes > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Body exceeds 50 MiB limit' }, { status: 413 })
  }

  // 解析 JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 校验顶层结构
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).events)
  ) {
    return NextResponse.json({ error: 'Missing events array' }, { status: 400 })
  }

  const rawEvents = (parsed as { events: unknown[] }).events

  // 校验每个事件
  const validRows: AnalyticsEventRow[] = []
  for (const raw of rawEvents) {
    if (!isValidEvent(raw)) {
      return NextResponse.json({ error: 'Invalid event structure' }, { status: 400 })
    }
    validRows.push({
      name: raw.name,
      props: raw.props as Record<string, unknown>,
      app_mode: APP_MODE,
      occurred_at: raw.occurredAt,
    })
  }

  // 插入
  const db = getDb()
  const inserted = insertEvents(db, validRows)

  return NextResponse.json({ inserted })
}
