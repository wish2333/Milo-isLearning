import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createSqliteDb, resetDbForTests, type SqliteDatabase } from '../db-singleton'
import { initDb } from '../schema'
import {
  createSession,
  saveCheckpoint,
  loadCheckpoint,
  getLastCompletedStage,
  getLatestCheckpointStage,
  completeSession,
  abandonSession,
  findActiveSession,
  getResumptionData,
} from '../compile-checkpoint'

describe('compile-checkpoint', () => {
  let db: SqliteDatabase

  beforeEach(() => {
    db = createSqliteDb(':memory:')
    initDb(db)
  })

  afterEach(() => {
    db.close()
    resetDbForTests()
  })

  describe('createSession', () => {
    it('creates a session and returns a UUID', () => {
      const id = createSession(db, 'hash-abc')
      expect(id).toBeTruthy()
      expect(id.length).toBeGreaterThan(0)

      const row = db
        .query<{ id: string; source_hash: string; status: string; last_stage: string | null }>(
          'SELECT id, source_hash, status, last_stage FROM compile_session WHERE id = ?',
        )
        .get(id)
      expect(row).not.toBeNull()
      expect(row!.source_hash).toBe('hash-abc')
      expect(row!.status).toBe('active')
      expect(row!.last_stage).toBeNull()
    })

    it('creates multiple sessions with unique IDs', () => {
      const id1 = createSession(db, 'hash-a')
      const id2 = createSession(db, 'hash-b')
      expect(id1).not.toBe(id2)
    })
  })

  describe('saveCheckpoint + loadCheckpoint', () => {
    it('round-trips artifact data', () => {
      const sessionId = createSession(db, 'hash-1')
      const artifact = { partialModule: { title: 'Test' }, concepts: ['c1'] }

      saveCheckpoint(db, sessionId, 'module', artifact)

      const loaded = loadCheckpoint(db, sessionId, 'module')
      expect(loaded).not.toBeNull()
      expect(loaded!.artifact).toEqual(artifact)
      expect(loaded!.usage).toBeUndefined()
    })

    it('round-trips artifact with token usage', () => {
      const sessionId = createSession(db, 'hash-2')
      const artifact = { data: 'test' }
      const usage = { promptTokens: 100, completionTokens: 50 }

      saveCheckpoint(db, sessionId, 'quiz', artifact, usage)

      const loaded = loadCheckpoint(db, sessionId, 'quiz')
      expect(loaded).not.toBeNull()
      expect(loaded!.artifact).toEqual(artifact)
      expect(loaded!.usage).toEqual(usage)
    })

    it('upserts on duplicate stage', () => {
      const sessionId = createSession(db, 'hash-3')
      saveCheckpoint(db, sessionId, 'module', { v1: true })
      saveCheckpoint(db, sessionId, 'module', { v2: true })

      const loaded = loadCheckpoint(db, sessionId, 'module')
      expect(loaded!.artifact).toEqual({ v2: true })
    })

    it('returns null for non-existent checkpoint', () => {
      const sessionId = createSession(db, 'hash-4')
      const loaded = loadCheckpoint(db, sessionId, 'import')
      expect(loaded).toBeNull()
    })

    it('updates session last_stage on save', () => {
      const sessionId = createSession(db, 'hash-5')
      saveCheckpoint(db, sessionId, 'module', { data: 1 })

      const stage = getLastCompletedStage(db, sessionId)
      expect(stage).toBe('module')
    })

    it('stores large artifact correctly', () => {
      const sessionId = createSession(db, 'hash-6')
      const bigObj: Record<string, unknown> = {}
      for (let i = 0; i < 500; i++) {
        bigObj[`key_${i}`] = `value_${i}_padding_text_`.repeat(50)
      }

      saveCheckpoint(db, sessionId, 'module', bigObj)

      const loaded = loadCheckpoint(db, sessionId, 'module')
      expect(loaded).not.toBeNull()
      expect(loaded!.artifact).toEqual(bigObj)
    })
  })

  describe('getLastCompletedStage / getLatestCheckpointStage', () => {
    it('returns null for fresh session', () => {
      const sessionId = createSession(db, 'hash-7')
      expect(getLastCompletedStage(db, sessionId)).toBeNull()
      expect(getLatestCheckpointStage(db, sessionId)).toBeNull()
    })

    it('returns the last saved stage', () => {
      const sessionId = createSession(db, 'hash-8')
      saveCheckpoint(db, sessionId, 'import', { a: 1 })
      saveCheckpoint(db, sessionId, 'concept', { b: 2 })
      saveCheckpoint(db, sessionId, 'module', { c: 3 })

      expect(getLastCompletedStage(db, sessionId)).toBe('module')
      expect(getLatestCheckpointStage(db, sessionId)).toBe('module')
    })
  })

  describe('completeSession / abandonSession', () => {
    it('marks session as completed', () => {
      const sessionId = createSession(db, 'hash-9')
      completeSession(db, sessionId)

      const row = db
        .query<{ status: string }>('SELECT status FROM compile_session WHERE id = ?')
        .get(sessionId)
      expect(row!.status).toBe('completed')

      // completed session should not be found as active
      expect(findActiveSession(db, 'hash-9')).toBeNull()
    })

    it('marks session as abandoned', () => {
      const sessionId = createSession(db, 'hash-10')
      abandonSession(db, sessionId)

      const row = db
        .query<{ status: string }>('SELECT status FROM compile_session WHERE id = ?')
        .get(sessionId)
      expect(row!.status).toBe('abandoned')

      // abandoned session should not be found as active
      expect(findActiveSession(db, 'hash-10')).toBeNull()
    })
  })

  describe('findActiveSession', () => {
    it('returns null when no active session exists', () => {
      expect(findActiveSession(db, 'no-such-hash')).toBeNull()
    })

    it('finds active session by sourceHash', () => {
      const id = createSession(db, 'hash-11')
      expect(findActiveSession(db, 'hash-11')).toBe(id)
    })

    it('returns null for completed session', () => {
      const id = createSession(db, 'hash-12')
      completeSession(db, id)
      expect(findActiveSession(db, 'hash-12')).toBeNull()
    })

    it('returns null for abandoned session', () => {
      const id = createSession(db, 'hash-13')
      abandonSession(db, id)
      expect(findActiveSession(db, 'hash-13')).toBeNull()
    })

    it('returns most recently updated session among multiples', () => {
      const id1 = createSession(db, 'hash-shared')
      saveCheckpoint(db, id1, 'import', { data: 1 })

      // complete first session
      completeSession(db, id1)

      const id2 = createSession(db, 'hash-shared')
      expect(findActiveSession(db, 'hash-shared')).toBe(id2)
    })
  })

  describe('getResumptionData', () => {
    it('returns empty data for session with no checkpoints', () => {
      const sessionId = createSession(db, 'hash-14')
      const result = getResumptionData(db, sessionId)
      expect(result.lastStage).toBeNull()
      expect(result.checkpoints.size).toBe(0)
    })

    it('returns checkpoints up to the last stage', () => {
      const sessionId = createSession(db, 'hash-15')
      saveCheckpoint(db, sessionId, 'import', { text: 'normalized' })
      saveCheckpoint(db, sessionId, 'module', { partialModule: true })

      const result = getResumptionData(db, sessionId)
      expect(result.lastStage).toBe('module')
      expect(result.checkpoints.size).toBe(2)
      expect(result.checkpoints.get('import')).toBeDefined()
      expect(result.checkpoints.get('module')).toBeDefined()
    })

    it('does not include checkpoints beyond lastStage', () => {
      const sessionId = createSession(db, 'hash-16')
      saveCheckpoint(db, sessionId, 'import', { a: 1 })
      saveCheckpoint(db, sessionId, 'module', { b: 2 })

      const result = getResumptionData(db, sessionId)
      // lastStage is 'module', so we should have import + module
      expect(result.checkpoints.size).toBe(2)
      expect(result.checkpoints.has('import')).toBe(true)
      expect(result.checkpoints.has('module')).toBe(true)
    })

    it('handles sparse checkpoints (non-contiguous stages)', () => {
      const sessionId = createSession(db, 'hash-17')
      // Only checkpoint module (skip import/chunk/concept per D-1 design)
      saveCheckpoint(db, sessionId, 'module', { partialModule: true })
      saveCheckpoint(db, sessionId, 'challenge', { quizComplete: true })

      const result = getResumptionData(db, sessionId)
      expect(result.lastStage).toBe('challenge')
      // Should have module + challenge (only the ones that exist up to 'challenge')
      expect(result.checkpoints.has('module')).toBe(true)
      expect(result.checkpoints.has('challenge')).toBe(true)
      expect(result.checkpoints.size).toBe(2)
    })
  })
})
