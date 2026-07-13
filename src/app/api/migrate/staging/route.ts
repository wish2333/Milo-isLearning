import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'

import { isStorageEnabled } from '@/lib/persistence/server/config'
import { uploadBatch, getSession } from '@/lib/persistence/server/migration-staging'
import { parseNamespace } from '@/lib/persistence/shared/namespace'
import { isAlcKey } from '@/lib/persistence/shared/keys'

export const runtime = 'nodejs'

const MAX_BATCH_SIZE = 512 * 1024 // 512 KiB/批（评审 D6 定案）
const MAX_BATCH_ENTRIES = 100 // 100 条/批

interface StagingEntryDTO {
  key: string
  value: string
}

/**
 * POST /api/migrate/staging -- 分批上传 staging
 *
 * Body: { sessionId: string, entries: StagingEntryDTO[] }
 * Response 200: { uploaded, totalUploaded }
 * Response 400: 批次超限 / key 不合法 / session 状态错误
 * Response 413: 超过大小限制
 */
export async function POST(req: NextRequest) {
  if (!isStorageEnabled) {
    return NextResponse.json({ enabled: false }, { status: 404 })
  }

  // Content-Length 校验
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10)
  if (contentLength > MAX_BATCH_SIZE + 1024) {
    return NextResponse.json({ error: '批次超过 512 KiB 上限' }, { status: 413 })
  }

  let body: { sessionId?: string; entries?: StagingEntryDTO[] }
  try {
    body = (await req.json()) as {
      sessionId?: string
      entries?: StagingEntryDTO[]
    }
  } catch {
    return NextResponse.json({ error: '无效 JSON' }, { status: 400 })
  }

  if (!body.sessionId || !Array.isArray(body.entries)) {
    return NextResponse.json({ error: '缺少 sessionId 或 entries' }, { status: 400 })
  }

  if (body.entries.length > MAX_BATCH_ENTRIES) {
    return NextResponse.json({ error: `单批超过 ${MAX_BATCH_ENTRIES} 条` }, { status: 413 })
  }

  // 校验每条 entry
  const validated: Array<{ key: string; value: string; namespace: string }> = []
  let bodyBytes = 0
  for (const entry of body.entries) {
    if (!isAlcKey(entry.key)) {
      return NextResponse.json(
        { error: `key ${entry.key.slice(0, 32)}... 非 alc:* 前缀` },
        { status: 400 },
      )
    }
    bodyBytes += entry.key.length + entry.value.length
    if (bodyBytes > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: '批次超过 512 KiB 上限' }, { status: 413 })
    }
    validated.push({
      key: entry.key,
      value: entry.value,
      namespace: parseNamespace(entry.key),
    })
  }

  const session = getSession(body.sessionId)
  if (!session) {
    return NextResponse.json({ error: 'session 不存在' }, { status: 404 })
  }

  try {
    const uploaded = uploadBatch(body.sessionId, validated)
    const updated = getSession(body.sessionId)!
    return NextResponse.json({
      uploaded,
      totalUploaded: updated.uploadedEntries,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    )
  }
}
