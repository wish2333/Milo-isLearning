import { describe, it, expect, beforeEach } from 'vitest'
import {
  createCompileJob,
  getCompileJob,
  updateCompileJob,
  clearCompileJob,
  getLatestCompileJob,
} from '../compile-job-store'
import type { StorageRepository } from '@/lib/persistence/shared/repository'

/** In-memory StorageRepository stub */
function makeRepo(): StorageRepository {
  const store = new Map<string, string>()
  return {
    get: <T>(key: string) => {
      const raw = store.get(key)
      if (raw === undefined) return null
      try {
        return JSON.parse(raw) as T
      } catch {
        return null
      }
    },
    set: (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value))
    },
    has: (key: string) => store.has(key),
    remove: (key: string) => {
      store.delete(key)
    },
    keys: () => Array.from(store.keys()).filter((k) => k.startsWith('alc:')),
    getRaw: (key: string) => store.get(key) ?? null,
    setRaw: (key: string, value: string) => {
      store.set(key, value)
    },
    clearAll: () => {
      for (const k of Array.from(store.keys())) {
        if (k.startsWith('alc:')) store.delete(k)
      }
    },
  }
}

describe('compile-job-store sessionId (PB.3)', () => {
  let repo: StorageRepository

  beforeEach(() => {
    repo = makeRepo()
  })

  it('createCompileJob defaults sessionId to null', () => {
    const job = createCompileJob(repo, {
      sourceContent: '# Test',
      configSummary: { provider: 'deepseek', model: 'deepseek-chat' },
    })
    expect(job.sessionId).toBeNull()
  })

  it('createCompileJob accepts explicit sessionId', () => {
    const job = createCompileJob(repo, {
      sourceContent: '# Test',
      configSummary: { provider: 'deepseek', model: 'deepseek-chat' },
      sessionId: 'sess-abc123',
    })
    expect(job.sessionId).toBe('sess-abc123')
  })

  it('createCompileJob accepts explicit null sessionId', () => {
    const job = createCompileJob(repo, {
      sourceContent: '# Test',
      configSummary: { provider: 'deepseek', model: 'deepseek-chat' },
      sessionId: null,
    })
    expect(job.sessionId).toBeNull()
  })

  it('updateCompileJob can set sessionId', () => {
    const job = createCompileJob(repo, {
      sourceContent: '# Test',
      configSummary: { provider: 'deepseek', model: 'deepseek-chat' },
    })
    expect(job.sessionId).toBeNull()

    const updated = updateCompileJob(repo, job.jobId, { sessionId: 'sess-xyz' })
    expect(updated?.sessionId).toBe('sess-xyz')
  })

  it('updateCompileJob persists sessionId to repo', () => {
    const job = createCompileJob(repo, {
      sourceContent: '# Test',
      configSummary: { provider: 'deepseek', model: 'deepseek-chat' },
    })
    updateCompileJob(repo, job.jobId, { sessionId: 'sess-persist' })

    const reloaded = getCompileJob(repo, job.jobId)
    expect(reloaded?.sessionId).toBe('sess-persist')
  })

  it('clearCompileJob removes job with sessionId', () => {
    const job = createCompileJob(repo, {
      sourceContent: '# Test',
      configSummary: { provider: 'deepseek', model: 'deepseek-chat' },
      sessionId: 'sess-del',
    })
    expect(getCompileJob(repo, job.jobId)).toBeTruthy()

    clearCompileJob(repo, job.jobId)
    expect(getCompileJob(repo, job.jobId)).toBeNull()
  })

  it('getLatestCompileJob returns job with sessionId', () => {
    const job1 = createCompileJob(repo, {
      sourceContent: '# First',
      configSummary: { provider: 'deepseek', model: 'deepseek-chat' },
    })
    updateCompileJob(repo, job1.jobId, { sessionId: 'sess-latest' })

    const latest = getLatestCompileJob(repo)
    expect(latest?.sessionId).toBe('sess-latest')
  })
})
