import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('server-only', () => ({}))

import { createSqliteDb } from './db-singleton'
import { verifyBackupFile, verifyLatestBackup } from './backup-verify'

describe('backup verification', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const directory of tempDirs.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('returns valid for an intact SQLite snapshot', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alc-backup-verify-'))
    tempDirs.push(directory)
    const backupPath = join(directory, 'alc-snapshot-test.db')
    const db = createSqliteDb(backupPath)
    db.run('CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
    db.run('INSERT INTO sample (value) VALUES (?)', ['ok'])
    db.close()

    expect(verifyBackupFile(backupPath)).toEqual({
      valid: true,
      backupPath,
      integrityCheck: 'ok',
    })
  })

  it('returns a non-throwing missing result when no snapshot exists', () => {
    expect(verifyLatestBackup(undefined)).toEqual({
      valid: false,
      backupPath: null,
      integrityCheck: 'missing',
      error: '未找到可验证的自动备份快照',
    })
  })

  it('does not create or accept a missing snapshot path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alc-backup-verify-'))
    tempDirs.push(directory)
    const backupPath = join(directory, 'missing.db')

    expect(verifyBackupFile(backupPath)).toEqual({
      valid: false,
      backupPath,
      integrityCheck: 'missing',
      error: '备份文件不存在',
    })
  })
})
