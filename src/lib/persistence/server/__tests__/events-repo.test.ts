import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createSqliteDb, resetDbForTests, type SqliteDatabase } from '../db-singleton'
import { initDb } from '../schema'
import { insertEvents, queryEvents, type AnalyticsEventRow } from '../events-repo'

describe('events-repo', () => {
  let db: SqliteDatabase

  beforeEach(() => {
    db = createSqliteDb(':memory:')
    initDb(db)
  })

  afterEach(() => {
    db.close()
    resetDbForTests()
  })

  describe('insertEvents', () => {
    it('inserts 3 events and returns count 3', () => {
      const events: AnalyticsEventRow[] = [
        { name: 'page_view', props: { path: '/learn' }, app_mode: 'production', occurred_at: 1000 },
        {
          name: 'quiz_answer',
          props: { correct: true },
          app_mode: 'production',
          occurred_at: 2000,
        },
        {
          name: 'page_view',
          props: { path: '/library' },
          app_mode: 'production',
          occurred_at: 3000,
        },
      ]

      const inserted = insertEvents(db, events)
      expect(inserted).toBe(3)

      const rows = db.query('SELECT COUNT(*) as cnt FROM events').get() as { cnt: number }
      expect(rows.cnt).toBe(3)
    })

    it('returns 0 for empty array without error', () => {
      const inserted = insertEvents(db, [])
      expect(inserted).toBe(0)

      const rows = db.query('SELECT COUNT(*) as cnt FROM events').get() as { cnt: number }
      expect(rows.cnt).toBe(0)
    })

    it('stores props_json as serialized JSON', () => {
      const events: AnalyticsEventRow[] = [
        {
          name: 'test',
          props: { key: 'value', nested: { a: 1 } },
          app_mode: 'production',
          occurred_at: 1000,
        },
      ]

      insertEvents(db, events)

      const row = db.query('SELECT props_json FROM events').get() as { props_json: string }
      expect(JSON.parse(row.props_json)).toEqual({ key: 'value', nested: { a: 1 } })
    })

    it('stores app_mode and occurred_at correctly', () => {
      const events: AnalyticsEventRow[] = [
        { name: 'test', props: {}, app_mode: 'showcase', occurred_at: 99999 },
      ]

      insertEvents(db, events)

      const row = db.query('SELECT app_mode, occurred_at FROM events').get() as {
        app_mode: string
        occurred_at: number
      }
      expect(row.app_mode).toBe('showcase')
      expect(row.occurred_at).toBe(99999)
    })

    it('handles large props_json (stress test)', () => {
      const bigObj: Record<string, unknown> = {}
      for (let i = 0; i < 1000; i++) {
        bigObj[`key_${i}`] = `value_${i}_padding_text_`.repeat(10)
      }

      const events: AnalyticsEventRow[] = [
        { name: 'big_event', props: bigObj, app_mode: 'production', occurred_at: 1000 },
      ]

      const inserted = insertEvents(db, events)
      expect(inserted).toBe(1)

      const queried = queryEvents(db)
      expect(queried).toHaveLength(1)
      expect(queried[0]!.props).toEqual(bigObj)
    })
  })

  describe('queryEvents', () => {
    function seedEvents(): void {
      const events: AnalyticsEventRow[] = [
        { name: 'page_view', props: { path: '/a' }, app_mode: 'production', occurred_at: 1000 },
        {
          name: 'quiz_answer',
          props: { correct: true },
          app_mode: 'production',
          occurred_at: 2000,
        },
        { name: 'page_view', props: { path: '/b' }, app_mode: 'production', occurred_at: 3000 },
        { name: 'compile', props: { duration: 5000 }, app_mode: 'production', occurred_at: 4000 },
      ]
      insertEvents(db, events)
    }

    it('returns all events sorted by occurred_at DESC', () => {
      seedEvents()

      const results = queryEvents(db)
      expect(results).toHaveLength(4)
      expect(results[0]!.occurred_at).toBe(4000)
      expect(results[3]!.occurred_at).toBe(1000)
    })

    it('filters by name', () => {
      seedEvents()

      const results = queryEvents(db, { name: 'page_view' })
      expect(results).toHaveLength(2)
      expect(results.every((r) => r.name === 'page_view')).toBe(true)
    })

    it('filters by since timestamp', () => {
      seedEvents()

      const results = queryEvents(db, { since: 2000 })
      expect(results).toHaveLength(3)
      expect(results.every((r) => r.occurred_at >= 2000)).toBe(true)
    })

    it('applies limit', () => {
      seedEvents()

      const results = queryEvents(db, { limit: 2 })
      expect(results).toHaveLength(2)
    })

    it('combines name + since + limit', () => {
      seedEvents()

      const results = queryEvents(db, { name: 'page_view', since: 2000, limit: 1 })
      expect(results).toHaveLength(1)
      expect(results[0]!.name).toBe('page_view')
      expect(results[0]!.occurred_at).toBe(3000)
    })

    it('returns empty array for no matches', () => {
      seedEvents()

      const results = queryEvents(db, { name: 'nonexistent' })
      expect(results).toHaveLength(0)
    })

    it('parses props_json back to object', () => {
      seedEvents()

      const results = queryEvents(db, { name: 'quiz_answer' })
      expect(results).toHaveLength(1)
      expect(results[0]!.props).toEqual({ correct: true })
    })
  })
})
