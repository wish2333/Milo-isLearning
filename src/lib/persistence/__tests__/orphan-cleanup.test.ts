import { describe, it, expect } from 'vitest'
import { detectOrphans, cleanupOrphans } from '../orphan-cleanup'
import type { StorageRepository } from '../shared/repository'

const PROGRESS_KEY = 'alc:state:progress'

function createMockRepo(entries: Record<string, string>): StorageRepository {
  const map = new Map(Object.entries(entries))
  return {
    get: <T>(key: string): T | null => {
      const val = map.get(key)
      if (val === undefined) return null
      try {
        return JSON.parse(val) as T
      } catch {
        return null
      }
    },
    set: <T>(key: string, value: T): void => {
      map.set(key, JSON.stringify(value))
    },
    remove: (key: string): void => {
      map.delete(key)
    },
    has: (key: string): boolean => map.has(key),
    keys: (): string[] => Array.from(map.keys()),
    getRaw: (key: string): string | null => map.get(key) ?? null,
    setRaw: (key: string, value: string): void => {
      map.set(key, value)
    },
    clearAll: (): void => {
      map.clear()
    },
  }
}

describe('orphan-cleanup', () => {
  it('no progress-store key returns empty report', () => {
    const repo = createMockRepo({})
    const report = detectOrphans(repo)
    expect(report.orphanProgressModuleIds).toEqual([])
  })

  it('progress-store has moduleId and module exists -> empty report', () => {
    const progressState = JSON.stringify({
      state: { moduleId: 'mod-123' },
      version: 0,
    })
    const repo = createMockRepo({
      [PROGRESS_KEY]: progressState,
      'alc:module:mod-123': JSON.stringify({ id: 'mod-123', title: 'Test' }),
    })
    const report = detectOrphans(repo)
    expect(report.orphanProgressModuleIds).toEqual([])
  })

  it('progress-store has moduleId but module missing -> reports orphan', () => {
    const progressState = JSON.stringify({
      state: { moduleId: 'mod-gone' },
      version: 0,
    })
    const repo = createMockRepo({
      [PROGRESS_KEY]: progressState,
    })
    const report = detectOrphans(repo)
    expect(report.orphanProgressModuleIds).toEqual(['mod-gone'])
  })

  it('cleanupOrphans removes orphan moduleId + stage + feynmanAttempt', () => {
    const progressState = JSON.stringify({
      state: { moduleId: 'mod-dead', stage: { kind: 'overview' }, feynmanAttempt: { score: 0.8 } },
      version: 3,
    })
    const repo = createMockRepo({
      [PROGRESS_KEY]: progressState,
    })

    const report = detectOrphans(repo)
    expect(report.orphanProgressModuleIds).toEqual(['mod-dead'])

    cleanupOrphans(repo, report)

    const after = repo.getRaw(PROGRESS_KEY)!
    const parsed = JSON.parse(after)
    expect(parsed.state.moduleId).toBeUndefined()
    expect(parsed.state.stage).toBeUndefined()
    expect(parsed.state.feynmanAttempt).toBeUndefined()
    expect(parsed.version).toBe(3)
  })

  it('cleanupOrphans on empty report is a no-op', () => {
    const progressState = JSON.stringify({
      state: { moduleId: 'mod-ok' },
      version: 0,
    })
    const repo = createMockRepo({
      [PROGRESS_KEY]: progressState,
      'alc:module:mod-ok': JSON.stringify({ id: 'mod-ok' }),
    })

    const report = detectOrphans(repo)
    expect(report.orphanProgressModuleIds).toEqual([])

    cleanupOrphans(repo, report)

    // 原封不动
    const after = repo.getRaw(PROGRESS_KEY)!
    expect(after).toBe(progressState)
  })

  it('malformed progress-store JSON returns empty report', () => {
    const repo = createMockRepo({
      [PROGRESS_KEY]: '{not valid json!!!',
    })
    const report = detectOrphans(repo)
    expect(report.orphanProgressModuleIds).toEqual([])
  })
})
