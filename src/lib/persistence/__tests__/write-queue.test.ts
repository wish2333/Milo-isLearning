import { describe, it, expect, beforeEach } from 'vitest'

import { WriteQueue } from '../client/write-queue'

describe('WriteQueue', () => {
  let processed: Array<{ key: string; value: string | null }>
  let processErrors: Map<string, Error>
  let queue: WriteQueue

  beforeEach(() => {
    processed = []
    processErrors = new Map()
    queue = new WriteQueue({
      onProcess: async (key, value) => {
        if (processErrors.has(key)) throw processErrors.get(key)!
        processed.push({ key, value })
      },
      retryBackoffMs: [10, 20, 40], // 测试用短退避
    })
  })

  it('FIFO 顺序处理不同 key', async () => {
    queue.enqueue('a', '1')
    queue.enqueue('b', '2')
    queue.enqueue('c', '3')
    await queue.flushNow()
    expect(processed).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
      { key: 'c', value: '3' },
    ])
  })

  it('per-key 合并：同 key 连续写 A->B 最终只发 B', async () => {
    queue.enqueue('a', 'A')
    queue.enqueue('a', 'B')
    await queue.flushNow()
    expect(processed).toEqual([{ key: 'a', value: 'B' }])
  })

  it('null value 表示 delete', async () => {
    queue.enqueue('a', null)
    await queue.flushNow()
    expect(processed).toEqual([{ key: 'a', value: null }])
  })

  it('重试 3 次后进入 failed 状态', async () => {
    processErrors.set('a', new Error('mock failure'))
    queue.enqueue('a', '1')
    // 等待全部重试 + 进入 failed
    await new Promise((r) => setTimeout(r, 200))
    expect(queue.getFailedTasks()).toHaveLength(1)
    expect(queue.getFailedTasks()[0]).toMatchObject({
      key: 'a',
      lastError: 'mock failure',
    })
    expect(queue.getFailedTasks()[0]?.failedAt).toEqual(expect.any(Number))
  })

  it('retryFailed 重新入队失败任务', async () => {
    processErrors.set('a', new Error('first fail'))
    queue.enqueue('a', '1')
    await new Promise((r) => setTimeout(r, 200))
    expect(queue.getFailedTasks()).toHaveLength(1)
    const failedTask = queue.getFailedTasks()[0]
    expect(failedTask?.lastError).toBe('first fail')
    expect(failedTask?.failedAt).toEqual(expect.any(Number))
    // 移除错误，重试应成功
    processErrors.delete('a')
    queue.retryFailed()
    await queue.flushNow()
    expect(queue.getFailedTasks()).toHaveLength(0)
    expect(processed).toContainEqual({ key: 'a', value: '1' })
    expect(failedTask?.lastError).toBeUndefined()
    expect(failedTask?.failedAt).toBeUndefined()
  })

  it('retryOne 只重新入队指定 key 的失败任务', async () => {
    processErrors.set('a', new Error('a failed'))
    processErrors.set('b', new Error('b failed'))
    queue.enqueue('a', '1')
    queue.enqueue('b', '2')
    await new Promise((r) => setTimeout(r, 250))
    expect(queue.getFailedTasks().map((task) => task.key)).toEqual(['a', 'b'])

    processErrors.delete('a')
    queue.retryOne('a')
    await queue.flushNow()

    expect(processed).toContainEqual({ key: 'a', value: '1' })
    expect(queue.getFailedTasks()).toMatchObject([
      { key: 'b', lastError: 'b failed', failedAt: expect.any(Number) },
    ])
  })

  it('hasPending 反映队列状态', async () => {
    expect(queue.hasPending()).toBe(false)
    queue.enqueue('a', '1')
    // enqueue 后立即有 pending
    expect(queue.hasPending()).toBe(true)
    await queue.flushNow()
    expect(queue.hasPending()).toBe(false)
  })

  it('flushNow 等待所有 pending 完成', async () => {
    queue.enqueue('a', '1')
    queue.enqueue('b', '2')
    await queue.flushNow()
    expect(processed).toHaveLength(2)
    expect(queue.hasPending()).toBe(false)
  })
})
