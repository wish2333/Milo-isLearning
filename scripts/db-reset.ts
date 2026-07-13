import { unlinkSync, existsSync } from 'node:fs'

const DB_PATH = 'data/alc.db'

if (!existsSync(DB_PATH)) {
  console.info(`[db:reset] Database file does not exist, nothing to reset: ${DB_PATH}`)
  process.exit(0)
}

// Close + delete entire db file (including WAL/SHM)
unlinkSync(DB_PATH)
try {
  unlinkSync(`${DB_PATH}-wal`)
} catch {
  // ignore
}
try {
  unlinkSync(`${DB_PATH}-shm`)
} catch {
  // ignore
}
console.info(`[db:reset] Deleted ${DB_PATH} (and WAL/SHM)`)
console.info(`[db:reset] Next dev server start will auto-rebuild schema.`)
