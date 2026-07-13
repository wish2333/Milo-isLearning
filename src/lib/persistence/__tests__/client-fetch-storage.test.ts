import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClientFetchStorageRepository } from '../client/client-fetch-storage'

// mock global fetch
const fetchMock = vi.fn()
globalThis.fetch = fetchMock as unknown as typeof fetch

describe('ClientFetchStorageRepository', () => {
  let repo: ClientFetchStorageRepository

  beforeEach(() => {
    fetchMock.mockReset()
    repo = new ClientFetchStorageRepository()
  })

  afterEach(async () => {
    // 排空队列，防止上一个测试的异步 fetch 泄漏到下一个测试的 mock.calls
    fetchMock.mockResolvedValue({ ok: true, status: 204 })
    await repo.flushNow()
  })

  it('loadFromServer 从 /api/data/bulk 拉取并填充 cache', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: [
          ['alc:module:m1', '{"id":"m1"}'],
          ['alc:settings', '{"provider":"deepseek"}'],
        ],
        revision: 12345,
        stats: { totalEntries: 2, totalBytes: 100 },
      }),
    })
    await repo.loadFromServer()
    expect(repo.getRaw('alc:module:m1')).toBe('{"id":"m1"}')
    expect(repo.getRaw('alc:settings')).toBe('{"provider":"deepseek"}')
    expect(repo.getRaw('alc:missing')).toBeNull()
  })

  it('set 立即更新 cache，可同步 get 读到', () => {
    repo.set('alc:test', { foo: 1 })
    expect(repo.get('alc:test')).toEqual({ foo: 1 })
  })

  it('setRaw 不做 JSON.stringify（透传原字符串）', () => {
    repo.setRaw('alc:raw', '{"x":1}')
    expect(repo.getRaw('alc:raw')).toBe('{"x":1}')
  })

  it('remove 同步删除 cache', () => {
    repo.setRaw('alc:k', 'v')
    expect(repo.has('alc:k')).toBe(true)
    repo.remove('alc:k')
    expect(repo.has('alc:k')).toBe(false)
  })

  it('keys 返回排序后的 alc: key', () => {
    repo.setRaw('alc:b', '1')
    repo.setRaw('alc:a', '2')
    repo.setRaw('non-alc', '3')
    expect(repo.keys()).toEqual(['alc:a', 'alc:b'])
  })

  it('loadFromServer 失败时抛错', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(repo.loadFromServer()).rejects.toThrow(/bulk.*500/)
  })

  it('clearAll 触发单次 POST /api/data/clear（不逐 key DELETE）', async () => {
    repo.setRaw('alc:a', '1')
    repo.setRaw('alc:b', '2')
    // mock fetch 接受所有操作
    fetchMock.mockResolvedValue({ ok: true, status: 204 })
    repo.clearAll()
    // clearAll 是 fire-and-forget POST /api/data/clear，不走写队列
    // 等微任务让 fetch 完成
    await new Promise((r) => setTimeout(r, 10))
    // 应该有 1 个 POST /clear 调用（含 setRaw 触发的 PUT 也走 fetch，但 clearAll 不发 DELETE）
    const clearCalls = fetchMock.mock.calls.filter((c: Array<unknown>) => {
      const url = String(c[0])
      const method = (c[1] as Record<string, unknown>)?.method
      return url.includes('/api/data/clear') && method === 'POST'
    })
    expect(clearCalls).toHaveLength(1)
    // 不应该有 DELETE 调用
    const deleteCalls = fetchMock.mock.calls.filter(
      (c: Array<unknown>) => (c[1] as Record<string, unknown>)?.method === 'DELETE',
    )
    expect(deleteCalls).toHaveLength(0)
  })
})
