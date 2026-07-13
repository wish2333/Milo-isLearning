import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/persistence/server/config', () => ({
  isStorageEnabled: true,
}))

import { initDb } from '../server/schema'
import {
  createSession,
  uploadBatch,
  validateSession,
  commitSession,
  cancelSession,
  getSession,
  MigrationConflictError,
  _resetMigrationForTests,
} from '../server/migration-staging'
import { createSqliteDb, resetDbForTests, type SqliteDatabase } from '../server/db-singleton'

// migration-staging 内部调用 getDb()（globalThis 单例），
// 测试通过 globalThis.__alcDb 注入内存 db
const globalForDb = globalThis as unknown as { __alcDb?: SqliteDatabase }

let testDb: SqliteDatabase

beforeEach(() => {
  resetDbForTests()
  testDb = createSqliteDb(':memory:')
  initDb(testDb)
  globalForDb.__alcDb = testDb
})

afterEach(() => {
  testDb.close()
  globalForDb.__alcDb = undefined
})

describe('createSession + uploadBatch + validateSession + commitSession', () => {
  it('完整流程：创建 -> 上传 -> 校验 -> 提交', () => {
    const session = createSession('fp-test-1', 2)
    expect(session.status).toBe('uploading')

    uploadBatch(session.id, [
      { key: 'alc:module:m1', value: '{"id":"m1"}', namespace: 'module' },
      { key: 'alc:settings', value: '{}', namespace: 'settings' },
    ])

    expect(validateSession(session.id)).toBe(true)

    const result = commitSession(session.id)
    expect(result.committedEntries).toBe(2)
    expect(result.skippedConflicts).toBe(0)

    const after = getSession(session.id)
    expect(after?.status).toBe('completed')
  })

  it('重复迁移同一 fingerprint 抛 MigrationConflictError', () => {
    const session = createSession('fp-dup', 1)
    uploadBatch(session.id, [{ key: 'alc:a', value: '1', namespace: 'a' }])
    commitSession(session.id)

    expect(() => createSession('fp-dup', 1)).toThrow(MigrationConflictError)
  })

  it('uploadBatch 对不存在的 session 抛错', () => {
    expect(() =>
      uploadBatch('nonexistent', [{ key: 'alc:a', value: '1', namespace: 'a' }]),
    ).toThrow(/不存在/)
  })

  it('uploadBatch 对非 uploading 状态的 session 抛错', () => {
    const session = createSession('fp-state', 1)
    uploadBatch(session.id, [{ key: 'alc:a', value: '1', namespace: 'a' }])
    commitSession(session.id)
    expect(() => uploadBatch(session.id, [{ key: 'alc:b', value: '2', namespace: 'b' }])).toThrow(
      /状态/,
    )
  })

  it('validateSession 条数不匹配抛错', () => {
    const session = createSession('fp-count', 5)
    uploadBatch(session.id, [{ key: 'alc:a', value: '1', namespace: 'a' }])
    expect(() => validateSession(session.id)).toThrow(/条数不匹配/)
  })

  it('validateSession 拒绝非法 JSON value', () => {
    const session = createSession('fp-bad', 1)
    // 直接 SQL 写入非法 JSON 绕过 uploadBatch
    testDb.run(
      `INSERT INTO migration_staging (session_id, key, value, namespace, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [session.id, 'alc:bad', '{not json', 'bad', Date.now()],
    )
    testDb.run(
      `UPDATE migration_session SET total_entries = 1, uploaded_entries = 1 WHERE id = ?`,
      [session.id],
    )
    expect(() => validateSession(session.id)).toThrow(/不是合法 JSON/)
  })

  it('commitSession 跳过 kv 已存在的冲突', () => {
    // 预置一条 kv
    testDb.run(`INSERT INTO kv (key, value, namespace, updated_at) VALUES (?, ?, ?, ?)`, [
      'alc:existing',
      '"old"',
      'existing',
      Date.now(),
    ])

    const session = createSession('fp-conflict', 2)
    uploadBatch(session.id, [
      { key: 'alc:existing', value: '"new"', namespace: 'existing' },
      { key: 'alc:new', value: '"new2"', namespace: 'new' },
    ])
    const result = commitSession(session.id)
    expect(result.committedEntries).toBe(1)
    expect(result.skippedConflicts).toBe(1)
  })

  it('cancelSession 清 staging + 标 cancelled', () => {
    const session = createSession('fp-cancel', 1)
    uploadBatch(session.id, [{ key: 'alc:a', value: '1', namespace: 'a' }])
    cancelSession(session.id)

    const after = getSession(session.id)
    expect(after?.status).toBe('cancelled')

    const staging = testDb
      .query('SELECT COUNT(*) AS c FROM migration_staging WHERE session_id = ?')
      .get(session.id) as { c?: number }
    expect(staging.c).toBe(0)

    // kv 没动
    const kv = testDb.query('SELECT COUNT(*) AS c FROM kv WHERE key = ?').get('alc:a') as {
      c?: number
    }
    expect(kv.c).toBe(0)
  })

  it('cancelSession 对已 completed 的 session 抛错', () => {
    const session = createSession('fp-done', 1)
    uploadBatch(session.id, [{ key: 'alc:a', value: '1', namespace: 'a' }])
    commitSession(session.id)
    expect(() => cancelSession(session.id)).toThrow(/completed/)
  })

  it('cancelSession 幂等（重复 cancel 不报错）', () => {
    const session = createSession('fp-idem', 1)
    uploadBatch(session.id, [{ key: 'alc:a', value: '1', namespace: 'a' }])
    cancelSession(session.id)
    expect(() => cancelSession(session.id)).not.toThrow()
  })

  it('commitSession 写入 meta migration_source_fingerprint', () => {
    const session = createSession('fp-meta', 1)
    uploadBatch(session.id, [{ key: 'alc:x', value: '"y"', namespace: 'x' }])
    commitSession(session.id)

    const meta = testDb
      .query("SELECT value FROM meta WHERE name = 'migration_source_fingerprint'")
      .get() as { value?: string } | null
    expect(meta?.value).toBe('fp-meta')
  })

  it('commit 后 staging 表清空', () => {
    const session = createSession('fp-staging-clear', 1)
    uploadBatch(session.id, [{ key: 'alc:x', value: '"y"', namespace: 'x' }])
    commitSession(session.id)

    const count = testDb
      .query('SELECT COUNT(*) AS c FROM migration_staging WHERE session_id = ?')
      .get(session.id) as { c?: number }
    expect(count.c).toBe(0)
  })
})

describe('_resetMigrationForTests', () => {
  it('清空 migration_session、staging 和 meta fingerprint', () => {
    const session = createSession('fp-reset', 1)
    uploadBatch(session.id, [{ key: 'alc:x', value: '"y"', namespace: 'x' }])
    commitSession(session.id)

    _resetMigrationForTests(testDb)

    const sessions = testDb.query('SELECT COUNT(*) AS c FROM migration_session').get() as {
      c?: number
    }
    expect(sessions.c).toBe(0)

    const staging = testDb.query('SELECT COUNT(*) AS c FROM migration_staging').get() as {
      c?: number
    }
    expect(staging.c).toBe(0)

    const meta = testDb
      .query("SELECT value FROM meta WHERE name = 'migration_source_fingerprint'")
      .get() as unknown | null
    expect(meta).toBeNull()
  })
})
