import 'server-only'

import type { SqliteDatabase } from './db-singleton'

/**
 * SQLite Schema -- v1.0.0 kv 存储 + 迁移 staging 表
 * v2.0.0 新增 events 表（F11 云遥测基础）
 * v3.0.0 新增 compile_session + compile_staging 表（F04 断点续编 checkpoint）
 *
 * Phase 1 创建全部 5 张表（kv / meta / migration_session / migration_staging / events），
 * 但 migration_* 表仅在 Phase 5 使用。提前创建以避免后续 ALTER。
 */

export const CURRENT_SCHEMA_VERSION = 3

export function initDb(db: SqliteDatabase): void {
  // SQLite 的 db.run() 只能执行单条语句，需拆成多次调用
  db.run(`
    CREATE TABLE IF NOT EXISTS kv (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      namespace  TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_kv_namespace ON kv(namespace)`)

  db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      name  TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS migration_session (
      id                 TEXT PRIMARY KEY,
      source_fingerprint TEXT NOT NULL,
      status             TEXT NOT NULL,
      total_entries      INTEGER,
      uploaded_entries   INTEGER DEFAULT 0,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS migration_staging (
      session_id  TEXT NOT NULL,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,
      namespace   TEXT NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (session_id, key)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      props_json  TEXT NOT NULL,
      app_mode    TEXT NOT NULL,
      occurred_at INTEGER NOT NULL
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_events_name_time ON events(name, occurred_at)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_events_time ON events(occurred_at)`)

  // F04: compile checkpoint -- 两表（session + staging）
  db.run(`
    CREATE TABLE IF NOT EXISTS compile_session (
      id              TEXT PRIMARY KEY,
      source_hash     TEXT NOT NULL,
      status          TEXT NOT NULL,
      last_stage      TEXT,
      total_concepts  INTEGER DEFAULT 0,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    )
  `)
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_compile_session_hash_status ON compile_session(source_hash, status)`,
  )

  db.run(`
    CREATE TABLE IF NOT EXISTS compile_staging (
      session_id    TEXT NOT NULL,
      stage_name    TEXT NOT NULL,
      artifact_json TEXT NOT NULL,
      token_usage   TEXT,
      created_at    INTEGER NOT NULL,
      PRIMARY KEY (session_id, stage_name)
    )
  `)

  // 写入 schema 版本（INSERT OR IGNORE 保证幂等）
  db.run(`INSERT OR IGNORE INTO meta (name, value) VALUES ('schema_version', ?)`, [
    String(CURRENT_SCHEMA_VERSION),
  ])
}

export function getSchemaVersion(db: SqliteDatabase): number {
  const row = db.query("SELECT value FROM meta WHERE name = 'schema_version'").get() as {
    value?: string
  } | null
  return row?.value ? parseInt(row.value, 10) : 0
}
