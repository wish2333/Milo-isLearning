import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'

const DB_PATH = 'data/alc.db'

if (!existsSync(DB_PATH)) {
  console.error(`[db:backup] Database file does not exist: ${DB_PATH}`)
  process.exit(1)
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const backupDir = 'data/backup'
mkdirSync(backupDir, { recursive: true })
const backupPath = `${backupDir}/alc-snapshot-${ts}.db`

const db = new Database(DB_PATH, { readonly: true })
db.run(`VACUUM INTO '${backupPath}';`)
db.close()
console.info(`[db:backup] Created consistent snapshot: ${backupPath}`)
