import 'server-only'

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { SQLITE_DB_PATH, isStorageEnabled } from './config'
import { initDb } from './schema'

// =================================================================
// 类型定义 — 对外暴露的 SqliteDatabase 接口
// =================================================================

/**
 * 预编译语句。query() 返回，链式调用 get/all。
 *
 * 兼容 bun:sqlite 行为：get() 无行匹配时返回 null（better-sqlite3 原生返回 undefined，
 * 由 SqliteAdapter 归一化为 null）。
 */
export interface SqliteStatement<T = unknown> {
  /** 单行查询；无行匹配返回 null。 */
  get(...params: unknown[]): T | null
  /** 多行查询。 */
  all(...params: unknown[]): T[]
}

/**
 * 项目内 SQLite 数据库统一接口。
 *
 * 这是 bun:sqlite 风格 API 的子集 —— 现有 schema/repository/migration 代码
 * 都按这个风格写，所以保留接口签名不变，底层用 better-sqlite3 适配。
 *
 * 为什么不用 better-sqlite3 原生 API？
 *   - better-sqlite3 用 prepare()，源码用的是 query()
 *   - better-sqlite3 用 db.exec() 处理无参 DDL/DML，源码用 db.run()
 *   - better-sqlite3 stmt.get() 无行返回 undefined，源码按 null 写
 *
 * 统一适配层比改 5 个文件简单且更安全。
 */
export interface SqliteDatabase {
  /** 编译 SQL，返回语句对象。 */
  query<T = unknown>(sql: string): SqliteStatement<T>
  /**
   * 执行 SQL。
   * - 无参：DDL / BEGIN / COMMIT / VACUUM 等（→ better-sqlite3 exec）
   * - 有参：DML（→ better-sqlite3 prepare().run(...params)）
   *
   * 兼容 bun:sqlite 习惯：单数组参数会被解包（db.run(sql, [a, b, c])）。
   */
  run(sql: string, ...params: unknown[]): void
  /** 关闭数据库连接。 */
  close(): void
}

// =================================================================
// better-sqlite3 → SqliteDatabase 适配层
// =================================================================

/**
 * SqliteAdapter — 用 better-sqlite3 实现 SqliteDatabase。
 *
 * better-sqlite3 是 Node.js 原生 SQLite 绑定（C++ addon），
 * 同步 API + 良好的 TypeScript 类型支持，可部署到 Vercel serverless。
 *
 * 之前用 bun:sqlite 失败的原因：
 *   - bun:sqlite 是 Bun 运行时内置虚拟模块
 *   - `next dev` / `next start` / Vercel serverless 都跑在 Node 上
 *   - Node 找不到 bun:sqlite，必然抛 MODULE_NOT_FOUND
 *
 * 即使 `bun run dev` 也不行 —— Next CLI 内部 spawn Node 子进程。
 */
class SqliteAdapter implements SqliteDatabase {
  private readonly raw: Database.Database

  constructor(path: string) {
    this.raw = new Database(path)
  }

  query<T = unknown>(sql: string): SqliteStatement<T> {
    const stmt = this.raw.prepare(sql)
    return {
      get: (...params: unknown[]): T | null => {
        // better-sqlite3 stmt.get() 无行返回 undefined；归一化为 null（bun:sqlite 行为）
        const result = params.length > 0 ? stmt.get(...params) : stmt.get()
        return result === undefined ? null : (result as T)
      },
      all: (...params: unknown[]): T[] => {
        return (params.length > 0 ? stmt.all(...params) : stmt.all()) as T[]
      },
    }
  }

  run(sql: string, ...params: unknown[]): void {
    if (params.length === 0) {
      // 无参 DDL / BEGIN / COMMIT / VACUUM 等
      this.raw.exec(sql)
    } else {
      const stmt = this.raw.prepare(sql)
      const first = params[0]
      // 兼容 bun:sqlite 习惯：db.run(sql, [a, b, c]) 单数组参数
      if (Array.isArray(first)) {
        stmt.run(...first)
      } else {
        stmt.run(...params)
      }
    }
  }

  close(): void {
    this.raw.close()
  }
}

// =================================================================
// 单例工厂 — dev server HMR 安全
// =================================================================

const globalForDb = globalThis as unknown as { __alcDb?: SqliteDatabase }

function createDb(): SqliteDatabase {
  mkdirSync(dirname(SQLITE_DB_PATH), { recursive: true })
  const db = new SqliteAdapter(SQLITE_DB_PATH)
  // 启用 WAL（更好的并发读 + 崩溃恢复）
  // 每个 PRAGMA 必须单独一条（SQLite 限制）
  db.run('PRAGMA journal_mode = WAL;')
  db.run('PRAGMA synchronous = NORMAL;')
  initDb(db)
  return db
}

/**
 * DB 单例 -- globalThis 守卫，避免 dev server HMR 频繁重连。
 *
 * 仅在 isStorageEnabled=true 时才创建实际连接。
 * isStorageEnabled=false 时调用 getDb() 会抛错——调用方应先检查 isStorageEnabled。
 */
export function getDb(): SqliteDatabase {
  if (!isStorageEnabled) {
    throw new Error(
      '[db-singleton] getDb() 在存储未启用时被调用。' +
        '请检查 NEXT_PUBLIC_APP_MODE 和 ALC_STORAGE_BACKEND。',
    )
  }
  if (!globalForDb.__alcDb) {
    globalForDb.__alcDb = createDb()
  }
  return globalForDb.__alcDb
}

/** 测试用：关闭并清除单例 */
export function resetDbForTests(): void {
  if (globalForDb.__alcDb) {
    globalForDb.__alcDb.close()
    delete globalForDb.__alcDb
  }
}

/**
 * 测试 / 脚本用：创建独立的内存或文件 SQLite 实例。
 *
 * 接受与 better-sqlite3 构造器一致的路径参数（':memory:' / 文件路径）。
 */
export function createSqliteDb(path: string): SqliteDatabase {
  return new SqliteAdapter(path)
}
