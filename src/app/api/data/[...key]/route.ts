import 'server-only'
import { type NextRequest, NextResponse } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { getServerRepo } from '../_lib/repo-singleton'
import { isAlcKey } from '@/lib/persistence/shared/keys'

export const runtime = 'nodejs'

const MAX_KEY_LENGTH = 256
const MAX_VALUE_BYTES = 2 * 1024 * 1024 // 单 value 上限 2 MiB

/**
 * /api/data/[...key] -- 单 key CRUD
 *
 * GET    -> 200 body=text/plain | 404
 * PUT    -> 204 | 400 | 413
 * DELETE -> 204 | 404
 *
 * 安全：
 *  - key 必须是 alc:* 前缀
 *  - key 长度 <= 256
 *  - PUT body 是 raw string（不 JSON wrap），<= 2 MiB
 *  - Origin 同源校验
 */

/** 从 URL 提取 key：/api/data/alc:module:xxx -> 'alc:module:xxx' */
function extractKey(segments: string[] | undefined): string | null {
  if (!segments || segments.length === 0) return null
  const key = segments.join('/')
  if (!isAlcKey(key)) return null
  if (key.length > MAX_KEY_LENGTH) return null
  return key
}

/** 解析真实 Host，处理反代转发场景（Vercel / nginx / Cloudflare） */
function resolveForwardedHost(req: NextRequest): string | null {
  // X-Forwarded-Host（反代标准 header）—— 优先
  const xfh = req.headers.get('x-forwarded-host')
  if (xfh) {
    const first = xfh.split(',')[0]
    if (first) return first.trim()
  }
  // Forwarded header（RFC 7239: Forwarded: host=example.com;proto=https）
  const forwarded = req.headers.get('forwarded')
  if (forwarded) {
    const match = /host="?([^;,\s]+)"?/i.exec(forwarded)
    if (match?.[1]) return match[1].trim()
  }
  // Fallback 到 Host header
  return req.headers.get('host')
}

/**
 * 同源校验
 *
 * 反代场景（如 Vercel serverless）下，Host header 可能是内部地址，
 * 而 Origin header 携带的是公网 URL。通过 X-Forwarded-Host / Forwarded
 * header 解析真实 Host，避免误判合法同源请求为跨域。
 *
 * 安全性：仅比对 host（含端口），不关心 protocol。
 * 攻击者无法伪造 X-Forwarded-Host，因为该 header 由可信反代设置，
 * 浏览器跨域请求不会携带此 header。
 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // 同源 GET 请求通常无 Origin header

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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ key?: string[] }> },
) {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 })
  }
  const { key: segments } = await ctx.params
  const key = extractKey(segments)
  if (!key) {
    return NextResponse.json({ error: '无效 key' }, { status: 400 })
  }
  const repo = getServerRepo()
  const value = repo.getRaw(key)
  if (value === null) {
    return NextResponse.json({ error: '未找到' }, { status: 404 })
  }
  // 返回原始字符串（不 JSON wrap），客户端按 text/plain 解析
  return new Response(value, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ key?: string[] }> },
) {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: '非法 Origin' }, { status: 403 })
  }
  const { key: segments } = await ctx.params
  const key = extractKey(segments)
  if (!key) {
    return NextResponse.json({ error: '无效 key' }, { status: 400 })
  }
  // Content-Length 双校验
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10)
  if (contentLength > MAX_VALUE_BYTES) {
    return NextResponse.json({ error: 'value 超过 2 MiB 上限' }, { status: 413 })
  }
  // body 是 raw 字符串（已序列化的 JSON 字符串），不要 JSON.parse
  const body = await req.text()
  if (Buffer.byteLength(body, 'utf-8') > MAX_VALUE_BYTES) {
    return NextResponse.json({ error: 'value 超过 2 MiB 上限' }, { status: 413 })
  }
  const repo = getServerRepo()
  repo.setRaw(key, body)
  return new Response(null, { status: 204 })
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ key?: string[] }> },
) {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: '非法 Origin' }, { status: 403 })
  }
  const { key: segments } = await ctx.params
  const key = extractKey(segments)
  if (!key) {
    return NextResponse.json({ error: '无效 key' }, { status: 400 })
  }
  const repo = getServerRepo()
  repo.remove(key)
  return new Response(null, { status: 204 })
}
