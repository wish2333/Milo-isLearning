import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'

const DB_PATH = 'data/alc.db'

if (!existsSync(DB_PATH)) {
  console.info(`[db:status] Database file does not exist: ${DB_PATH}`)
  process.exit(0)
}

const db = new Database(DB_PATH, { readonly: true })
const cnt = db.query('SELECT COUNT(*) AS cnt FROM kv').get() as { cnt?: number }
const bytes = db
  .query('SELECT COALESCE(SUM(LENGTH(key) + LENGTH(value)), 0) AS bytes FROM kv')
  .get() as { bytes?: number }
const version = db.query("SELECT value FROM meta WHERE name = 'schema_version'").get() as {
  value?: string
} | null

console.info(`[db:status] Path: ${DB_PATH}`)
console.info(`[db:status] schema_version: ${version?.value ?? 'unknown'}`)
console.info(`[db:status] Entries: ${cnt.cnt ?? 0}`)
console.info(`[db:status] Bytes: ${bytes.bytes ?? 0}`)
db.close()
