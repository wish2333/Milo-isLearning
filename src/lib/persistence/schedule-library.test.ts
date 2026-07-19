import { beforeEach, describe, expect, it } from 'vitest'

import type { SchedulingData } from '@/types/domain'
import type { StorageRepository } from './shared/repository'

import {
  clearAll,
  get,
  listAll,
  listByModule,
  listDueBefore,
  remove,
  set,
} from './schedule-library'

class MemoryRepository implements StorageRepository {
  private readonly values = new Map<string, string>()

  get<T>(key: string): T | null {
    const raw = this.values.get(key)
    return raw === undefined ? null : (JSON.parse(raw) as T)
  }

  set<T>(key: string, value: T): void {
    this.values.set(key, JSON.stringify(value))
  }

  remove(key: string): void {
    this.values.delete(key)
  }

  has(key: string): boolean {
    return this.values.has(key)
  }

  keys(): string[] {
    return [...this.values.keys()]
  }

  getRaw(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setRaw(key: string, value: string): void {
    this.values.set(key, value)
  }

  clearAll(): void {
    this.values.clear()
  }
}

function schedule(overrides: Partial<SchedulingData> = {}): SchedulingData {
  return {
    slotId: 'c1:0',
    moduleId: 'm1',
    conceptId: 'c1',
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 'new',
    due: '2026-07-17T00:00:00.000Z',
    last_review: null,
    schemaVersion: 1,
    contentRevision: 'content',
    configRevision: 'config',
    lastAppliedAttemptId: 'a1',
    ...overrides,
  }
}

describe('schedule-library', () => {
  let repo: MemoryRepository

  beforeEach(() => {
    repo = new MemoryRepository()
  })

  it('supports CRUD and deterministic listAll', () => {
    const first = schedule({ slotId: 'c1:0' })
    const second = schedule({ slotId: 'c1:1' })
    set(second.slotId, second, repo)
    set(first.slotId, first, repo)

    expect(get(first.slotId, repo)).toEqual(first)
    expect(listAll(repo).map((entry) => entry.slotId)).toEqual(['c1:0', 'c1:1'])

    remove(first.slotId, repo)
    expect(get(first.slotId, repo)).toBeNull()
    expect(listAll(repo)).toEqual([second])
  })

  it('lists module entries and cascades only schedule keys on clearAll', () => {
    set('c1:0', schedule({ slotId: 'c1:0', moduleId: 'm1' }), repo)
    set('c2:0', schedule({ slotId: 'c2:0', moduleId: 'm2' }), repo)
    repo.set('alc:module:m1', { title: 'kept' })

    expect(listByModule('m1', repo).map((entry) => entry.slotId)).toEqual(['c1:0'])
    clearAll(repo)
    expect(listAll(repo)).toEqual([])
    expect(repo.has('alc:module:m1')).toBe(true)
  })

  it('compares due dates in the requested local timezone at a boundary', () => {
    const dueBefore = schedule({ slotId: 'before', due: '2026-07-16T23:30:00.000Z' })
    const dueAfter = schedule({ slotId: 'after', due: '2026-07-17T00:30:00.000Z' })
    set(dueBefore.slotId, dueBefore, repo)
    set(dueAfter.slotId, dueAfter, repo)

    const cutoff = new Date('2026-07-17T00:00:00.000Z')
    expect(listDueBefore(cutoff, 'Asia/Shanghai', repo).map((entry) => entry.slotId)).toEqual([
      'before',
    ])
    expect(listDueBefore(cutoff, 'UTC', repo).map((entry) => entry.slotId)).toEqual(['before'])
  })

  it('does not fall back to the server timezone for invalid timezone input', () => {
    set('c1:0', schedule(), repo)
    expect(listDueBefore(new Date('2026-07-18T00:00:00Z'), 'Not/AZone', repo)).toEqual([])
  })

  it('keeps chronological order through a DST fall-back hour', () => {
    // New York repeats 01:00 on 2026-11-01. The 01:30 EDT due instant is
    // earlier than the later 01:00 EST cutoff despite its wall-clock label.
    set('dst', schedule({ slotId: 'dst', due: '2026-11-01T05:30:00.000Z' }), repo)
    expect(
      listDueBefore(new Date('2026-11-01T06:00:00.000Z'), 'America/New_York', repo).map(
        (entry) => entry.slotId,
      ),
    ).toEqual(['dst'])
  })
})
