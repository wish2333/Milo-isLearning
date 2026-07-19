import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AUTO_BACKUP_MAX_AGE_MS, shouldBackup, shouldCreateAutoSnapshot } from './auto-backup'

describe('auto-backup', () => {
  const now = 1_700_000_000_000

  describe('shouldBackup', () => {
    it('creates the first snapshot when no prior snapshot exists', () => {
      expect(shouldBackup(null, AUTO_BACKUP_MAX_AGE_MS, now)).toBe(true)
    })

    it('does not create a snapshot at or below the strict 24 hour threshold', () => {
      expect(shouldBackup(now - AUTO_BACKUP_MAX_AGE_MS, AUTO_BACKUP_MAX_AGE_MS, now)).toBe(false)
      expect(shouldBackup(now - AUTO_BACKUP_MAX_AGE_MS + 1, AUTO_BACKUP_MAX_AGE_MS, now)).toBe(
        false,
      )
    })

    it('creates a snapshot only after the 24 hour threshold has passed', () => {
      expect(shouldBackup(now - AUTO_BACKUP_MAX_AGE_MS - 1, AUTO_BACKUP_MAX_AGE_MS, now)).toBe(true)
    })
  })

  describe('shouldCreateAutoSnapshot', () => {
    it('force creates a snapshot even when the latest one is still fresh', () => {
      expect(shouldCreateAutoSnapshot(true, now, now)).toBe(true)
    })

    it('uses the age threshold when force is false', () => {
      expect(shouldCreateAutoSnapshot(false, now, now)).toBe(false)
    })
  })
})
