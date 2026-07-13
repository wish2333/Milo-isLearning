import 'server-only'

import { getDb, type SqliteDatabase } from './db-singleton'

/**
 * 迁移 staging 工具（评审 3.2.4 定案）
 *
 * 流程：
 *   1. createSession(fingerprint) -> 写 migration_session，返回 sessionId
 *   2. uploadBatch(sessionId, entries[]) -> 写 migration_staging（INSERT OR REPLACE）
 *   3. validateSession(sessionId) -> 校验条数、JSON 合法性
 *   4. commitSession(sessionId) -> 单事务：staging -> kv + 写 meta + 清 staging + 标 session=completed
 *   5. cancelSession(sessionId) -> DELETE staging + 标 session=cancelled
 *
 * 防重复迁移：meta 表记录 migration_source_fingerprint，
 *   createSession 时如果 fingerprint 已记录则拒绝。
 */

export type MigrationStatus =
  'uploading' | 'validating' | 'committing' | 'completed' | 'cancelled' | 'failed'

export interface MigrationSession {
  id: string
  sourceFingerprint: string
  status: MigrationStatus
  totalEntries: number | null
  uploadedEntries: number
  createdAt: number
  updatedAt: number
}

const META_FINGERPRINT_KEY = 'migration_source_fingerprint'

/**
 * 创建新 migration session。
 *
 * 防重复：如果 meta 表已有相同 sourceFingerprint，抛错。
 */
export function createSession(sourceFingerprint: string, totalEntries: number): MigrationSession {
  const db = getDb()

  // 检查 fingerprint 是否已迁移过
  const existing = db.query('SELECT value FROM meta WHERE name = ?').get(META_FINGERPRINT_KEY) as {
    value?: string
  } | null
  if (existing?.value === sourceFingerprint) {
    throw new MigrationConflictError(`fingerprint ${sourceFingerprint.slice(0, 8)}... 已迁移过`)
  }

  const sessionId = `migr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const now = Date.now()

  db.run(
    `INSERT INTO migration_session (id, source_fingerprint, status, total_entries, uploaded_entries, created_at, updated_at)
     VALUES (?, ?, 'uploading', ?, 0, ?, ?)`,
    [sessionId, sourceFingerprint, totalEntries, now, now],
  )

  return {
    id: sessionId,
    sourceFingerprint,
    status: 'uploading',
    totalEntries,
    uploadedEntries: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * 分批上传 staging 条目。
 *
 * 使用 INSERT OR REPLACE：同 key 重复上传以最新为准（容错）。
 * 更新 migration_session.uploaded_entries。
 *
 * @returns 本批上传条数
 */
export function uploadBatch(
  sessionId: string,
  entries: Array<{ key: string; value: string; namespace: string }>,
): number {
  const db = getDb()

  // 验证 session 存在且 status=uploading
  const session = getSession(sessionId)
  if (!session) throw new Error(`session ${sessionId} 不存在`)
  if (session.status !== 'uploading') {
    throw new Error(`session ${sessionId} 状态 ${session.status}，不能上传`)
  }

  const now = Date.now()
  db.run('BEGIN TRANSACTION')
  try {
    for (const entry of entries) {
      db.run(
        `INSERT OR REPLACE INTO migration_staging (session_id, key, value, namespace, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, entry.key, entry.value, entry.namespace, now],
      )
    }
    db.run(
      `UPDATE migration_session SET uploaded_entries = (
         SELECT COUNT(*) FROM migration_staging WHERE session_id = ?
       ), updated_at = ? WHERE id = ?`,
      [sessionId, now, sessionId],
    )
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }

  return entries.length
}

/**
 * 校验 session 当前状态：
 *   - staging 表条数 == session.totalEntries
 *   - 每条 value 是合法 JSON
 *
 * @returns 校验通过返回 true；不通过抛错。
 */
export function validateSession(sessionId: string): boolean {
  const db = getDb()

  const session = getSession(sessionId)
  if (!session) throw new Error(`session ${sessionId} 不存在`)

  const stagingCount = db
    .query('SELECT COUNT(*) AS cnt FROM migration_staging WHERE session_id = ?')
    .get(sessionId) as { cnt?: number }
  const count = stagingCount.cnt ?? 0

  if (session.totalEntries !== null && count !== session.totalEntries) {
    throw new Error(`条数不匹配：期望 ${session.totalEntries}，实际 ${count}`)
  }

  // 校验每条 value 是合法 JSON
  const rows = db
    .query('SELECT key, value FROM migration_staging WHERE session_id = ?')
    .all(sessionId) as Array<{ key: string; value: string }>
  for (const row of rows) {
    try {
      JSON.parse(row.value)
    } catch {
      throw new Error(`key ${row.key} 的 value 不是合法 JSON`)
    }
  }

  return true
}

/**
 * 提交迁移：staging -> kv + 写 meta fingerprint + 清 staging，全程单事务。
 *
 * 调用前应已 validateSession 成功。
 *
 * 冲突策略：INSERT OR IGNORE 跳过 kv 已存在的 key（评审 D8 定案）。
 * 为兼容 bun:sqlite / better-sqlite3 的 run() 返回值差异，
 * 采用「先 SELECT 后 INSERT」判断冲突。
 */
export function commitSession(sessionId: string): {
  committedEntries: number
  skippedConflicts: number
} {
  const db = getDb()

  const session = getSession(sessionId)
  if (!session) throw new Error(`session ${sessionId} 不存在`)
  if (session.status !== 'uploading') {
    throw new Error(`session ${sessionId} 状态 ${session.status}，不能 commit`)
  }

  // 标记为 committing
  db.run(`UPDATE migration_session SET status = 'committing', updated_at = ? WHERE id = ?`, [
    Date.now(),
    sessionId,
  ])

  let committedEntries = 0
  let skippedConflicts = 0

  try {
    db.run('BEGIN TRANSACTION')

    // staging -> kv
    const stagingRows = db
      .query(
        `SELECT s.key AS key, s.value AS value, s.namespace AS namespace, s.updated_at AS updated_at
         FROM migration_staging s
         WHERE s.session_id = ?
         ORDER BY s.key`,
      )
      .all(sessionId) as Array<{
      key: string
      value: string
      namespace: string
      updated_at: number
    }>

    for (const row of stagingRows) {
      const existing = db.query('SELECT 1 FROM kv WHERE key = ?').get(row.key) as unknown | null
      if (existing) {
        skippedConflicts++
      } else {
        db.run(`INSERT INTO kv (key, value, namespace, updated_at) VALUES (?, ?, ?, ?)`, [
          row.key,
          row.value,
          row.namespace,
          row.updated_at,
        ])
        committedEntries++
      }
    }

    // 写 meta fingerprint（防重复迁移）
    db.run(`INSERT OR REPLACE INTO meta (name, value) VALUES (?, ?)`, [
      META_FINGERPRINT_KEY,
      session.sourceFingerprint,
    ])

    // 清 staging
    db.run('DELETE FROM migration_staging WHERE session_id = ?', [sessionId])

    // 标记 session 完成
    db.run(`UPDATE migration_session SET status = 'completed', updated_at = ? WHERE id = ?`, [
      Date.now(),
      sessionId,
    ])

    db.run('COMMIT')
    return { committedEntries, skippedConflicts }
  } catch (err) {
    db.run('ROLLBACK')
    // 标记 session failed
    db.run(`UPDATE migration_session SET status = 'failed', updated_at = ? WHERE id = ?`, [
      Date.now(),
      sessionId,
    ])
    throw err
  }
}

/**
 * 取消未 commit 的 session：清 staging + 标 cancelled。
 * 已 commit 的 session 不能 cancel。
 */
export function cancelSession(sessionId: string): void {
  const db = getDb()

  const session = getSession(sessionId)
  if (!session) throw new Error(`session ${sessionId} 不存在`)
  if (session.status === 'completed') {
    throw new Error(`session ${sessionId} 已 completed，不能 cancel`)
  }
  if (session.status === 'cancelled') {
    return // 幂等
  }

  db.run('BEGIN TRANSACTION')
  try {
    db.run('DELETE FROM migration_staging WHERE session_id = ?', [sessionId])
    db.run(`UPDATE migration_session SET status = 'cancelled', updated_at = ? WHERE id = ?`, [
      Date.now(),
      sessionId,
    ])
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }
}

/**
 * 读取 session 元数据。
 */
export function getSession(sessionId: string): MigrationSession | null {
  const db = getDb()
  const row = db
    .query(
      `SELECT id, source_fingerprint, status, total_entries, uploaded_entries, created_at, updated_at
       FROM migration_session WHERE id = ?`,
    )
    .get(sessionId) as {
    id: string
    source_fingerprint: string
    status: MigrationStatus
    total_entries: number | null
    uploaded_entries: number
    created_at: number
    updated_at: number
  } | null

  if (!row) return null

  return {
    id: row.id,
    sourceFingerprint: row.source_fingerprint,
    status: row.status,
    totalEntries: row.total_entries,
    uploadedEntries: row.uploaded_entries,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 自定义错误：迁移冲突（重复迁移同一 fingerprint）
 */
export class MigrationConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationConflictError'
  }
}

/**
 * 测试用：重置所有 migration_session 和 staging（不影响 kv 和 meta）
 */
export function _resetMigrationForTests(db: SqliteDatabase): void {
  db.run('DELETE FROM migration_staging')
  db.run('DELETE FROM migration_session')
  db.run("DELETE FROM meta WHERE name = 'migration_source_fingerprint'")
}
