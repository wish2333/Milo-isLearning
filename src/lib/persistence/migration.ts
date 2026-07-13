import 'client-only'

import {
  scanLegacyLocalStorage,
  filterShowcaseOrigin,
  markMigrated,
  markDismissed,
  type ScannedEntry,
} from './client/legacy-local-storage-scanner'
import { getProductionStorage } from './client/storage'
import { isShowcaseMode } from '@/lib/runtime/app-mode'

// 注意：不 import backup-package（含 node:crypto，不能进 client bundle）。
// source-snapshot 上传时直接发 raw entries，由 server 端 route 调用
// buildBackupPackage + sanitizeEntriesForExport 构造完整 BackupPackage。

/**
 * 迁移编排器（评审 §3.2.4 + §5 P5.6 定案）
 *
 * 流程：
 *   1. scanLegacyLocalStorage -> ScanResult
 *   2. 用户确认（UI 触发 runMigration）
 *   3. 上传 LS 来源快照到 server（保存为 alc-ls-snapshot-*.json）
 *   4. 创建 migration session
 *   5. 分批上传 staging（100 条或 512 KiB/批）
 *   6. server commit（单事务 staging -> kv + 写 meta + 清 staging）
 *   7. 客户端重新加载 cache + rehydrate
 *   8. 写 client marker
 */

const API_BASE = '/api'
const MAX_BATCH_ENTRIES = 100
// 客户端字节预算，严格低于服务端 512 KiB 字节上限。
// 考虑：
//   - UTF-8 多字节字符（中文 3 字节/字符，emoji 4 字节）
//   - JSON.stringify 包装开销（每 entry ~20 字节 + sessionId ~50 字节 + 整体结构 ~30 字节）
// 留 ~25% 余量足够覆盖。
const MAX_BATCH_BYTES = 384 * 1024

/**
 * 估算单条 entry 在 fetch body JSON 中占的 UTF-8 字节数。
 *
 * 之前 bug：用 entry.key.length + entry.valueRaw.length 算「字符数」，
 * 但中文富数据 UTF-8 字节是字符数 2-3 倍，触发服务端 413。
 *
 * 现在用 TextEncoder 精确算 UTF-8 字节，并模拟 JSON 包装：
 *   {"key":<json>,"value":<json>},
 */
const textEncoder = new TextEncoder()
function entryBodyBytes(entry: ScannedEntry): number {
  // JSON.stringify 在浏览器同步且快；包装字符串模拟 {"key":...,"value":...} + 后续逗号
  const wrapped = JSON.stringify({ key: entry.key, value: entry.valueRaw })
  return textEncoder.encode(wrapped).length + 1 // +1 给 entry 间逗号
}

export type MigrationProgress =
  | { phase: 'scan' }
  | { phase: 'snapshot'; message: string }
  | { phase: 'session'; message: string }
  | { phase: 'upload'; uploaded: number; total: number }
  | { phase: 'commit'; message: string }
  | { phase: 'reload'; message: string }
  | { phase: 'done'; committed: number; skipped: number; durationMs: number }
  | { phase: 'error'; message: string; phase_failed: string }

export interface RunMigrationArgs {
  includeShowcase: boolean
  onProgress: (p: MigrationProgress) => void
  shouldCancel?: () => boolean
}

/**
 * 执行完整迁移流程。
 *
 * @throws 任何 phase 失败都抛错（UI 显示错误）
 */
export async function runMigration(args: RunMigrationArgs): Promise<void> {
  if (isShowcaseMode) {
    throw new Error('showcase 模式不支持迁移')
  }
  const startTime = Date.now()
  const { includeShowcase, onProgress, shouldCancel } = args

  // Phase 1: 扫描
  onProgress({ phase: 'scan' })
  const scan = await scanLegacyLocalStorage()
  if (scan.entries.length === 0) {
    onProgress({ phase: 'error', message: 'LS 无可迁移数据', phase_failed: 'scan' })
    throw new Error('无可迁移数据')
  }

  const filtered = filterShowcaseOrigin(scan.entries, includeShowcase)
  if (filtered.length === 0) {
    onProgress({
      phase: 'error',
      message: '过滤后无可迁移数据（全是 showcase origin）',
      phase_failed: 'scan',
    })
    throw new Error('过滤后无数据')
  }

  // Phase 2: 上传 LS 来源快照
  onProgress({ phase: 'snapshot', message: '上传来源快照...' })
  if (shouldCancel?.()) throw new MigrationCancelledError()
  await uploadSourceSnapshot(filtered)

  // Phase 3: 创建 migration session
  onProgress({ phase: 'session', message: '创建迁移 session...' })
  if (shouldCancel?.()) throw new MigrationCancelledError()
  const sessionId = await createSession(scan.sourceFingerprint, filtered.length)

  try {
    // Phase 4: 分批上传 staging
    onProgress({ phase: 'upload', uploaded: 0, total: filtered.length })
    const batches = chunkBySize(filtered, MAX_BATCH_ENTRIES, MAX_BATCH_BYTES)
    let uploaded = 0
    for (const batch of batches) {
      if (shouldCancel?.()) {
        await cancelSession(sessionId)
        throw new MigrationCancelledError()
      }
      const result = await uploadBatch(sessionId, batch)
      uploaded += result.uploaded
      onProgress({ phase: 'upload', uploaded, total: filtered.length })
    }

    // Phase 5: server commit
    onProgress({ phase: 'commit', message: '提交迁移...（此步骤不可取消）' })
    const commitResult = await commitSession(sessionId)

    // Phase 6: 重新加载 cache
    onProgress({ phase: 'reload', message: '重新加载缓存...' })
    const repo = getProductionStorage()
    await repo.loadFromServer()
    // rehydrate 由调用方（StorageInitializer / AppShell）触发

    // Phase 7: 写 client marker
    markMigrated()

    onProgress({
      phase: 'done',
      committed: commitResult.committedEntries,
      skipped: commitResult.skippedConflicts,
      durationMs: Date.now() - startTime,
    })
  } catch (err) {
    if (!(err instanceof MigrationCancelledError)) {
      try {
        await cancelSession(sessionId)
      } catch {
        // 静默
      }
    }
    throw err
  }
}

/**
 * 用户「稍后」：记录 dismissed-at。
 */
export function dismissMigration(): void {
  markDismissed()
}

// =================================================================
// HTTP helpers
// =================================================================

async function uploadSourceSnapshot(entries: ScannedEntry[]): Promise<void> {
  // 注意：不调用 buildBackupPackage（那个 import node:crypto，不能进 client bundle）。
  // 直接发 raw entries 给 server，由 server 端的 source-snapshot 路由负责
  // 调用 buildBackupPackage + sanitizeEntriesForExport + 计算 checksum + 写盘。
  const body = JSON.stringify({
    source: 'legacy-local-storage',
    entries: entries.map((e) => ({ key: e.key, value: e.valueRaw })),
  })
  const res = await fetch(`${API_BASE}/migrate/source-snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(`来源快照上传失败：${errorBody.error ?? res.status}`)
  }
}

async function createSession(fingerprint: string, totalEntries: number): Promise<string> {
  const res = await fetch(`${API_BASE}/migrate/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceFingerprint: fingerprint, totalEntries }),
  })
  if (res.status === 409) {
    throw new Error('该 LS 数据已迁移过（fingerprint 重复）')
  }
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(`创建 session 失败：${errorBody.error ?? res.status}`)
  }
  const body = (await res.json()) as { sessionId: string }
  return body.sessionId
}

async function uploadBatch(
  sessionId: string,
  batch: ScannedEntry[],
): Promise<{ uploaded: number; totalUploaded: number }> {
  const res = await fetch(`${API_BASE}/migrate/staging`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      entries: batch.map((e) => ({ key: e.key, value: e.valueRaw })),
    }),
  })
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(`上传批次失败：${errorBody.error ?? res.status}`)
  }
  return (await res.json()) as { uploaded: number; totalUploaded: number }
}

async function commitSession(sessionId: string): Promise<{
  committedEntries: number
  skippedConflicts: number
}> {
  const res = await fetch(`${API_BASE}/migrate/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(`commit 失败：${errorBody.error ?? res.status}`)
  }
  return (await res.json()) as { committedEntries: number; skippedConflicts: number }
}

async function cancelSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/migrate/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
  } catch {
    // 静默
  }
}

// =================================================================
// 分批算法
// =================================================================

function chunkBySize(
  entries: ScannedEntry[],
  maxEntries: number,
  maxBytes: number,
): ScannedEntry[][] {
  const batches: ScannedEntry[][] = []
  let currentBatch: ScannedEntry[] = []
  let currentBytes = 0

  for (const entry of entries) {
    // 修正：用 entryBodyBytes 精确算 UTF-8 字节（含 JSON 包装），
    // 不再用字符数（之前 bug 触发服务端 413）。
    const entryBytes = entryBodyBytes(entry)

    if (
      currentBatch.length >= maxEntries ||
      (currentBatch.length > 0 && currentBytes + entryBytes > maxBytes)
    ) {
      batches.push(currentBatch)
      currentBatch = []
      currentBytes = 0
    }

    currentBatch.push(entry)
    currentBytes += entryBytes
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

/**
 * 自定义错误：用户取消迁移
 */
export class MigrationCancelledError extends Error {
  constructor() {
    super('迁移已取消')
    this.name = 'MigrationCancelledError'
  }
}

export type { ScanResult, ScannedEntry } from './client/legacy-local-storage-scanner'
