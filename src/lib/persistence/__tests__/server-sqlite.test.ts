import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// server-only 包在实际运行时会抛错（"This module cannot be imported from a Client Component"）。
// vitest worker 不是 Next.js bundler，所以这个守卫不会触发静态分析，会真的执行 throw。
// 因此必须 mock 掉，让 import 'server-only' 变成 no-op。
vi.mock('server-only', () => ({}))

import { createSqliteDb, resetDbForTests, type SqliteDatabase } from '../server/db-singleton'

import { initDb, CURRENT_SCHEMA_VERSION, getSchemaVersion } from '../server/schema'
import { ServerSQLiteRepository } from '../server/sqlite-repository'

describe('ServerSQLiteRepository', () => {
  let db: SqliteDatabase
  let repo: ServerSQLiteRepository

  beforeEach(() => {
    db = createSqliteDb(':memory:')
    initDb(db)
    repo = new ServerSQLiteRepository(db)
  })

  afterEach(() => {
    db.close()
    resetDbForTests()
  })

  describe('基础 CRUD', () => {
    it('set/get 往返一致', () => {
      repo.set('alc:module:m1', { id: 'm1', name: 'test' })
      const result = repo.get<{ id: string; name: string }>('alc:module:m1')
      expect(result).toEqual({ id: 'm1', name: 'test' })
    })

    it('get 不存在的 key 返回 null', () => {
      expect(repo.get('alc:missing')).toBeNull()
    })

    it('get 在 JSON 解析失败时返回 null', () => {
      repo.setRaw('alc:bad', '{not valid json')
      expect(repo.get('alc:bad')).toBeNull()
    })

    it('setRaw/getRaw 往返一致（不经过 JSON.stringify）', () => {
      const raw = '{"id":"m1","name":"test"}'
      repo.setRaw('alc:module:m1', raw)
      expect(repo.getRaw('alc:module:m1')).toBe(raw)
    })

    it('remove 后 has 返回 false', () => {
      repo.set('alc:test', { foo: 1 })
      expect(repo.has('alc:test')).toBe(true)
      repo.remove('alc:test')
      expect(repo.has('alc:test')).toBe(false)
      expect(repo.get('alc:test')).toBeNull()
    })

    it('remove 不存在的 key 静默无错', () => {
      expect(() => repo.remove('alc:nope')).not.toThrow()
    })

    it('set 覆写已有 key', () => {
      repo.set('alc:k', 'v1')
      repo.set('alc:k', 'v2')
      expect(repo.get('alc:k')).toBe('v2')
    })
  })

  describe('keys / clearAll', () => {
    it('keys 返回全部 alc: key（已排序）', () => {
      repo.setRaw('alc:module:m2', '{}')
      repo.setRaw('alc:module:m1', '{}')
      repo.setRaw('alc:settings', '{}')
      const keys = repo.keys()
      expect(keys).toEqual(['alc:module:m1', 'alc:module:m2', 'alc:settings'])
    })

    it('clearAll 清空全部 alc: 数据', () => {
      repo.setRaw('alc:a', '1')
      repo.setRaw('alc:b', '2')
      repo.clearAll()
      expect(repo.keys()).toEqual([])
    })
  })

  describe('namespace 列', () => {
    it('set 写入正确的 namespace 列', () => {
      repo.set('alc:module:m1', { foo: 1 })
      repo.set('alc:state:progress', { bar: 2 })
      const rows = db.query('SELECT key, namespace FROM kv ORDER BY key').all() as Array<{
        key: string
        namespace: string
      }>
      const map = Object.fromEntries(rows.map((r) => [r.key, r.namespace]))
      expect(map['alc:module:m1']).toBe('module')
      expect(map['alc:state:progress']).toBe('state')
    })
  })

  describe('扩展方法', () => {
    it('dumpAll 返回 [key, valueRaw] 元组数组', () => {
      repo.setRaw('alc:a', 'x')
      repo.setRaw('alc:b', 'y')
      const entries = repo.dumpAll()
      expect(entries).toEqual([
        ['alc:a', 'x'],
        ['alc:b', 'y'],
      ])
    })

    it('count + totalBytes 反映数据量', () => {
      repo.setRaw('alc:k', 'value')
      expect(repo.count()).toBe(1)
      // 'alc:k'.length + 'value'.length = 5 + 5 = 10
      expect(repo.totalBytes()).toBe(10)
    })
  })

  describe('Schema 初始化', () => {
    it('initDb 创建全部 4 张表', () => {
      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
      const names = tables.map((t) => t.name)
      expect(names).toContain('kv')
      expect(names).toContain('meta')
      expect(names).toContain('migration_session')
      expect(names).toContain('migration_staging')
    })

    it('schema_version 写入 meta 表', () => {
      expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION)
    })

    it('initDb 幂等（重复调用不报错）', () => {
      expect(() => initDb(db)).not.toThrow()
      expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION)
    })
  })
})
