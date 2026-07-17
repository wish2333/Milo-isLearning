import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let showcaseMode = true
const getProductionStorageMock = vi.fn()

vi.mock('@/lib/runtime/app-mode', () => ({
  get isShowcaseMode() {
    return showcaseMode
  },
}))

vi.mock('./storage', () => ({
  getProductionStorage: getProductionStorageMock,
}))

const { runAutoBackup, triggerAutoBackup } = await import('./auto-backup-trigger')

describe('triggerAutoBackup', () => {
  const events: string[] = []
  const fetchMock = vi.fn()
  const originalFetch = globalThis.fetch
  const repo = {
    flushNow: vi.fn(async () => {
      events.push('flush')
    }),
    getFailedTasks: vi.fn((): readonly unknown[] => {
      events.push('failed')
      return []
    }),
  }

  beforeEach(() => {
    showcaseMode = true
    events.length = 0
    vi.clearAllMocks()
    getProductionStorageMock.mockReturnValue(repo)
    fetchMock.mockImplementation(async () => {
      events.push('backup')
      return { ok: true, status: 200 }
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('showcase 模式跳过 production storage 与备份请求', async () => {
    await triggerAutoBackup(false)

    expect(getProductionStorageMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('production 模式按 flush → failed check → backup 顺序执行', async () => {
    showcaseMode = false

    await runAutoBackup(true, repo)

    expect(events).toEqual(['flush', 'failed', 'backup'])
    expect(fetchMock).toHaveBeenCalledWith('/api/backup/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    })
  })

  it('存在失败写入任务时不发起备份请求', async () => {
    showcaseMode = false
    repo.getFailedTasks.mockReturnValueOnce([
      {
        operationId: 1,
        key: 'alc:test',
        value: '{}',
        attempts: 3,
        status: 'failed',
      },
    ])

    await runAutoBackup(false, repo)

    expect(repo.flushNow).toHaveBeenCalledOnce()
    expect(repo.getFailedTasks).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
