import 'server-only'

import type { SqliteDatabase } from './db-singleton'

import type { StorageRepository } from '../shared/repository'
import { isAlcKey } from '../shared/keys'
import { parseNamespace } from '../shared/namespace'

/**
 * ServerSQLiteRepository -- 基于 SQLite 的 StorageRepository 实现
 *
 * 底层依赖 SqliteDatabase（见 db-singleton.ts），由 better-sqlite3 适配。
 * 所有方法均为同步（SQLite 同步 API）。事务由调用方管理；
 * 本类独立完成读写，不暴露外部事务边界。
 *
 * 仅在 isStorageEnabled=true 时实例化。
 */

export class ServerSQLiteRepository implements StorageRepository {
  constructor(private readonly db: SqliteDatabase) {}

  get<T>(key: string): T | null {
    const raw = this.getRaw(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T): void {
    this.setRaw(key, JSON.stringify(value))
  }

  setRaw(key: string, value: string): void {
    const namespace = parseNamespace(key)
    const now = Date.now()
    this.db.run(
      `INSERT OR REPLACE INTO kv (key, value, namespace, updated_at) VALUES (?, ?, ?, ?)`,
      [key, value, namespace, now],
    )
  }

  remove(key: string): void {
    this.db.run('DELETE FROM kv WHERE key = ?', [key])
  }

  has(key: string): boolean {
    const row = this.db.query('SELECT 1 AS hit FROM kv WHERE key = ? LIMIT 1').get(key) as {
      hit?: number
    } | null
    return row !== null
  }

  keys(): string[] {
    const rows = this.db.query('SELECT key FROM kv ORDER BY key ASC').all() as Array<{
      key: string
    }>
    return rows.map((r) => r.key).filter(isAlcKey)
  }

  getRaw(key: string): string | null {
    const row = this.db.query('SELECT value FROM kv WHERE key = ? LIMIT 1').get(key) as {
      value?: string
    } | null
    return row?.value ?? null
  }

  clearAll(): void {
    this.db.run('DELETE FROM kv')
  }

  // ----- 扩展方法（不在接口中） -----

  /** 全量导出，供 /api/data/bulk 使用。返回 [key, valueRaw] 元组数组。 */
  dumpAll(): Array<[string, string]> {
    const rows = this.db.query('SELECT key, value FROM kv ORDER BY key ASC').all() as Array<{
      key: string
      value: string
    }>
    return rows.map((r) => [r.key, r.value] as [string, string])
  }

  /** 总字节数（key + value UTF-8 长度）。供 /api/data/status 统计。 */
  totalBytes(): number {
    const row = this.db
      .query(`SELECT COALESCE(SUM(LENGTH(key) + LENGTH(value)), 0) AS bytes FROM kv`)
      .get() as { bytes?: number } | null
    return row?.bytes ?? 0
  }

  /** 总条目数。 */
  count(): number {
    const row = this.db.query('SELECT COUNT(*) AS cnt FROM kv').get() as {
      cnt?: number
    } | null
    return row?.cnt ?? 0
  }
}
