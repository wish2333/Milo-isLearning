import 'server-only'

import crypto from 'node:crypto'

import type { SqliteDatabase } from './db-singleton'
import type { CompileStage } from '@/lib/compiler/pipeline/types'

// =================================================================
// 类型
// =================================================================

interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

interface CheckpointRow {
  session_id: string
  stage_name: string
  artifact_json: string
  token_usage: string | null
  created_at: number
}

export interface CheckpointData {
  artifact: unknown
  usage?: TokenUsage
}

interface SessionRow {
  id: string
  source_hash: string
  status: string
  last_stage: string | null
  total_concepts: number
  created_at: number
  updated_at: number
}

// =================================================================
// 实现
// =================================================================

const COMPILE_STAGE_ORDER: readonly CompileStage[] = [
  'expand',
  'import',
  'chunk',
  'concept',
  'module',
  'mission',
  'quiz',
  'challenge',
  'feynman',
]

/** 创建编译 session，返回 sessionId。 */
export function createSession(db: SqliteDatabase, sourceHash: string): string {
  const id = crypto.randomUUID()
  const now = Date.now()

  db.run(
    `INSERT INTO compile_session (id, source_hash, status, last_stage, total_concepts, created_at, updated_at)
     VALUES (?, ?, 'active', NULL, 0, ?, ?)`,
    id,
    sourceHash,
    now,
    now,
  )

  return id
}

/** 保存 stage checkpoint。 */
export function saveCheckpoint(
  db: SqliteDatabase,
  sessionId: string,
  stage: CompileStage,
  artifact: unknown,
  usage?: TokenUsage,
): void {
  const now = Date.now()
  const artifactJson = JSON.stringify(artifact)
  const usageJson = usage ? JSON.stringify(usage) : null

  db.run(
    `INSERT INTO compile_staging (session_id, stage_name, artifact_json, token_usage, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id, stage_name) DO UPDATE SET
       artifact_json = excluded.artifact_json,
       token_usage = excluded.token_usage,
       created_at = excluded.created_at`,
    sessionId,
    stage,
    artifactJson,
    usageJson,
    now,
  )

  // 更新 session 的 last_stage 和 updated_at
  db.run(
    `UPDATE compile_session SET last_stage = ?, updated_at = ? WHERE id = ?`,
    stage,
    now,
    sessionId,
  )
}

/** 加载指定 stage 的 checkpoint。 */
export function loadCheckpoint(
  db: SqliteDatabase,
  sessionId: string,
  stage: CompileStage,
): CheckpointData | null {
  const row = db
    .query<CheckpointRow>(
      'SELECT artifact_json, token_usage FROM compile_staging WHERE session_id = ? AND stage_name = ?',
    )
    .get(sessionId, stage)

  if (!row) return null

  const result: CheckpointData = {
    artifact: JSON.parse(row.artifact_json) as unknown,
  }
  if (row.token_usage) {
    result.usage = JSON.parse(row.token_usage) as TokenUsage
  }
  return result
}

/** 获取 session 中最后完成 checkpoint 的 stage。 */
export function getLastCompletedStage(db: SqliteDatabase, sessionId: string): CompileStage | null {
  const row = db
    .query<SessionRow>('SELECT last_stage FROM compile_session WHERE id = ?')
    .get(sessionId)

  if (!row || !row.last_stage) return null

  return row.last_stage as CompileStage
}

/** 获取 session 中实际有数据的最后一个 stage（从 staging 表查，比 session.last_stage 更精确）。 */
export function getLatestCheckpointStage(
  db: SqliteDatabase,
  sessionId: string,
): CompileStage | null {
  const row = db
    .query<{ stage_name: string }>(
      'SELECT stage_name FROM compile_staging WHERE session_id = ? ORDER BY rowid DESC LIMIT 1',
    )
    .get(sessionId)

  if (!row) return null
  return row.stage_name as CompileStage
}

/** 标记 session 完成。 */
export function completeSession(db: SqliteDatabase, sessionId: string): void {
  const now = Date.now()
  db.run(
    "UPDATE compile_session SET status = 'completed', updated_at = ? WHERE id = ?",
    now,
    sessionId,
  )
}

/** 标记 session 放弃。 */
export function abandonSession(db: SqliteDatabase, sessionId: string): void {
  const now = Date.now()
  db.run(
    "UPDATE compile_session SET status = 'abandoned', updated_at = ? WHERE id = ?",
    now,
    sessionId,
  )
}

/** 查找指定 sourceHash 的 active session，返回 sessionId。 */
export function findActiveSession(db: SqliteDatabase, sourceHash: string): string | null {
  const row = db
    .query<{ id: string }>(
      "SELECT id FROM compile_session WHERE source_hash = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
    )
    .get(sourceHash)

  return row?.id ?? null
}

/** 获取 resume 所需的全部 checkpoint 数据（从 stage 0 到 lastStage 之间的所有 checkpoint）。 */
export function getResumptionData(
  db: SqliteDatabase,
  sessionId: string,
): {
  lastStage: CompileStage | null
  checkpoints: Map<CompileStage, CheckpointData>
} {
  const stageOrder = COMPILE_STAGE_ORDER
  const lastStage = getLastCompletedStage(db, sessionId)

  const checkpoints = new Map<CompileStage, CheckpointData>()
  if (!lastStage) {
    return { lastStage: null, checkpoints }
  }

  // Load ALL checkpoints for this session, then filter to those <= lastStage in stage order
  const rows = db
    .query<{ stage_name: string; artifact_json: string; token_usage: string | null }>(
      'SELECT stage_name, artifact_json, token_usage FROM compile_staging WHERE session_id = ?',
    )
    .all(sessionId)

  const lastStageIdx = stageOrder.indexOf(lastStage)

  for (const row of rows) {
    const stage = row.stage_name as CompileStage
    const stageIdx = stageOrder.indexOf(stage)
    if (stageIdx >= 0 && stageIdx <= lastStageIdx) {
      const data: CheckpointData = {
        artifact: JSON.parse(row.artifact_json) as unknown,
      }
      if (row.token_usage) {
        data.usage = JSON.parse(row.token_usage) as TokenUsage
      }
      checkpoints.set(stage, data)
    }
  }

  return { lastStage, checkpoints }
}
