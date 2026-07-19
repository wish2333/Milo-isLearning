import { describe, it, expect, afterEach, vi } from 'vitest'

// server-only 在 vitest 环境下会抛错，mock 掉
vi.mock('server-only', () => ({}))

describe('server config — ALC_DB_PATH 覆盖', () => {
  const originalDbPath = process.env.ALC_DB_PATH
  const originalBackupDir = process.env.ALC_BACKUP_DIR

  afterEach(() => {
    if (originalDbPath === undefined) {
      delete process.env.ALC_DB_PATH
    } else {
      process.env.ALC_DB_PATH = originalDbPath
    }
    if (originalBackupDir === undefined) {
      delete process.env.ALC_BACKUP_DIR
    } else {
      process.env.ALC_BACKUP_DIR = originalBackupDir
    }
    vi.resetModules()
  })

  it('未设 ALC_DB_PATH 时 fallback 到默认 data/alc.db', async () => {
    delete process.env.ALC_DB_PATH
    const mod = await import('../config')
    expect(mod.SQLITE_DB_PATH).toBe('data/alc.db')
  })

  it('设置 ALC_DB_PATH 后使用新路径', async () => {
    process.env.ALC_DB_PATH = '/tmp/alc-test-isolated.db'
    const mod = await import('../config')
    expect(mod.SQLITE_DB_PATH).toBe('/tmp/alc-test-isolated.db')
  })

  it('设置 ALC_BACKUP_DIR 后使用隔离备份目录', async () => {
    process.env.ALC_BACKUP_DIR = '/tmp/alc-backup-isolated'
    const mod = await import('../config')
    expect(mod.SQLITE_BACKUP_DIR).toBe('/tmp/alc-backup-isolated')
  })

  it('isStorageEnabled 受 NEXT_PUBLIC_APP_MODE + ALC_STORAGE_BACKEND 双开关控制', async () => {
    const mod = await import('../config')
    expect(mod.isStorageEnabled).toBe(
      process.env.NEXT_PUBLIC_APP_MODE === 'production' &&
        process.env.ALC_STORAGE_BACKEND === 'sqlite',
    )
  })
})
