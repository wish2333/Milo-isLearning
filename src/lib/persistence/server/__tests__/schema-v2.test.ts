import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createSqliteDb, resetDbForTests, type SqliteDatabase } from '../db-singleton'

import { initDb, CURRENT_SCHEMA_VERSION, getSchemaVersion } from '../schema'

describe('Schema v2 -- events table', () => {
  let db: SqliteDatabase

  beforeEach(() => {
    db = createSqliteDb(':memory:')
  })

  afterEach(() => {
    db.close()
    resetDbForTests()
  })

  describe('Fresh DB init', () => {
    it('creates events table with correct columns', () => {
      initDb(db)

      const columns = db.query('PRAGMA table_info(events)').all() as Array<{
        name: string
        type: string
        notnull: number
        pk: number
      }>

      const colNames = columns.map((c) => c.name)
      expect(colNames).toEqual(['id', 'name', 'props_json', 'app_mode', 'occurred_at'])

      const idCol = columns.find((c) => c.name === 'id')!
      expect(idCol.type).toBe('INTEGER')
      expect(idCol.pk).toBe(1)

      const nameCol = columns.find((c) => c.name === 'name')!
      expect(nameCol.notnull).toBe(1)
    })

    it('creates idx_events_name_time index', () => {
      initDb(db)

      const indexes = db
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_name_time'")
        .all() as Array<{ name: string }>
      expect(indexes).toHaveLength(1)
    })

    it('creates idx_events_time index', () => {
      initDb(db)

      const indexes = db
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_events_time'")
        .all() as Array<{ name: string }>
      expect(indexes).toHaveLength(1)
    })

    it('writes schema_version=3 to meta', () => {
      initDb(db)

      expect(getSchemaVersion(db)).toBe(3)
      expect(CURRENT_SCHEMA_VERSION).toBe(3)
    })
  })

  describe('v1 -> v2 upgrade', () => {
    it('auto-creates events table when upgrading from v1 DB', () => {
      // Simulate a v1 DB: create only the original 4 tables + schema_version=1
      db.run(`
        CREATE TABLE IF NOT EXISTS kv (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          namespace  TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)
      db.run(`CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value TEXT NOT NULL)`)
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
      db.run(`INSERT INTO meta (name, value) VALUES ('schema_version', '1')`)

      // Verify v1 state
      expect(getSchemaVersion(db)).toBe(1)
      const tablesBefore = db
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
      expect(tablesBefore.map((t) => t.name)).not.toContain('events')

      // Run initDb (simulates upgrade)
      initDb(db)

      // events table should now exist
      const tablesAfter = db
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
      expect(tablesAfter.map((t) => t.name)).toContain('events')

      // schema_version stays 1 because INSERT OR IGNORE -- meta already has the row
      // This is expected: v1 DBs already have schema_version=1, upgrade doesn't overwrite
      expect(getSchemaVersion(db)).toBe(1)
    })

    it('kv table data survives upgrade', () => {
      // Simulate v1 DB with data
      db.run(`
        CREATE TABLE IF NOT EXISTS kv (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          namespace  TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)
      db.run(`CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value TEXT NOT NULL)`)
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
      db.run(`INSERT INTO meta (name, value) VALUES ('schema_version', '1')`)
      db.run(`INSERT INTO kv (key, value, namespace, updated_at) VALUES (?, ?, ?, ?)`, [
        'alc:module:test',
        '{"id":"test"}',
        'module',
        Date.now(),
      ])

      // Run upgrade
      initDb(db)

      // kv data intact
      const row = db.query("SELECT value FROM kv WHERE key = 'alc:module:test'").get() as {
        value: string
      } | null
      expect(row).not.toBeNull()
      expect(row!.value).toBe('{"id":"test"}')
    })

    it('indexes exist after v1 upgrade', () => {
      // Simulate v1 DB
      db.run(
        `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, namespace TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
      )
      db.run(`CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value TEXT NOT NULL)`)
      db.run(
        `CREATE TABLE IF NOT EXISTS migration_session (id TEXT PRIMARY KEY, source_fingerprint TEXT NOT NULL, status TEXT NOT NULL, total_entries INTEGER, uploaded_entries INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      )
      db.run(
        `CREATE TABLE IF NOT EXISTS migration_staging (session_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, namespace TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (session_id, key))`,
      )
      db.run(`INSERT INTO meta (name, value) VALUES ('schema_version', '1')`)

      initDb(db)

      const indexes = db
        .query(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_events%' ORDER BY name",
        )
        .all() as Array<{ name: string }>
      expect(indexes.map((i) => i.name)).toEqual(['idx_events_name_time', 'idx_events_time'])
    })
  })

  describe('Idempotency', () => {
    it('repeated initDb calls do not error', () => {
      initDb(db)
      initDb(db)
      initDb(db)

      expect(getSchemaVersion(db)).toBe(3)

      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
      expect(tables.map((t) => t.name)).toContain('events')
    })
  })
})
