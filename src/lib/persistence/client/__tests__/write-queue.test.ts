import { describe, expect, it } from 'vitest'

import { WriteQueue } from '../write-queue'

describe('WriteQueue', () => {
  it('flushNow waits for an automatic retry before resolving', async () => {
    let calls = 0
    const queue = new WriteQueue({
      onProcess: async () => {
        calls++
        if (calls === 1) throw new Error('transient')
      },
      retryBackoffMs: [5, 5],
    })

    queue.enqueue('alc:module:test', '{"id":"test"}')
    await queue.flushNow()

    expect(calls).toBe(2)
    expect(queue.hasPending()).toBe(false)
    expect(queue.getFailedTasks()).toHaveLength(0)
  })

  it('does not replace a newer value with an older retry', async () => {
    let calls = 0
    const values: string[] = []
    const queue = new WriteQueue({
      onProcess: async (_key, value) => {
        calls++
        values.push(value ?? '')
        if (calls === 1) {
          queue.enqueue('alc:module:test', '{"id":"new"}')
          throw new Error('transient')
        }
      },
      retryBackoffMs: [5, 5],
    })

    queue.enqueue('alc:module:test', '{"id":"old"}')
    await queue.flushNow()

    expect(values).toEqual(['{"id":"old"}', '{"id":"new"}'])
    expect(queue.getFailedTasks()).toHaveLength(0)
  })
})
