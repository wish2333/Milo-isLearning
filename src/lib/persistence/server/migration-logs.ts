import 'server-only'
import { mkdirSync, appendFileSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'

const LOG_DIR = 'data/migration-logs'
const MAX_AUTO_LOGS = 10

/**
 * 写入一行 JSONL。如果 session 日志不存在会创建。
 */
export function writeLog(sessionId: string, entry: object): void {
  mkdirSync(LOG_DIR, { recursive: true })
  const filePath = join(LOG_DIR, `${sessionId}.jsonl`)
  appendFileSync(filePath, JSON.stringify({ ts: Date.now(), ...entry }) + '\n', 'utf8')
}

/**
 * 自动清理超出 MAX_AUTO_LOGS 的旧日志（按 mtime 排序）。
 * 失败 session 的日志不特殊保留——可手动 cp。
 */
export function pruneOldLogs(): void {
  let files: string[]
  try {
    files = readdirSync(LOG_DIR)
  } catch {
    return
  }
  const logs = files
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const filePath = join(LOG_DIR, f)
      let mtime = 0
      try {
        mtime = statSync(filePath).mtimeMs
      } catch {
        // stat 失败：mtime=0，会被优先清理
      }
      return { name: f, path: filePath, mtime }
    })
    .sort((a, b) => b.mtime - a.mtime)

  for (const log of logs.slice(MAX_AUTO_LOGS)) {
    try {
      unlinkSync(log.path)
    } catch {
      // 删除失败：跳过
    }
  }
}
