import { beforeEach, describe, expect, it, vi } from 'vitest'

const nodeStorage = new Map<string, string>()

vi.hoisted(() => {
  globalThis.localStorage = {
    getItem: (key: string) => nodeStorage.get(key) ?? null,
    setItem: (key: string, value: string) => nodeStorage.set(key, value),
    removeItem: (key: string) => nodeStorage.delete(key),
    get length() {
      return nodeStorage.size
    },
    key: (index: number) => [...nodeStorage.keys()][index] ?? null,
    clear: () => nodeStorage.clear(),
  } as Storage
  if (!globalThis.window) {
    ;(globalThis as Record<string, unknown>).window = {} as Window
  }
})

import { track, flushEvents, getPendingEvents, _resetForTesting } from '../analytics'
import { storage } from '@/lib/persistence/local-storage'

describe('analytics', () => {
  beforeEach(() => {
    nodeStorage.clear()
    _resetForTesting()
  })

  it('enqueues events to LocalStorage batch', () => {
    track('test_event', { foo: 'bar' })
    const events = getPendingEvents()
    expect(events).toHaveLength(1)
    expect(events[0]!.name).toBe('test_event')
    expect(events[0]!.props?.foo).toBe('bar')
  })

  it('handles multiple events in sequence', () => {
    track('event_a')
    track('event_b', { num: 42 })
    track('event_c', { flag: true })
    const events = getPendingEvents()
    expect(events).toHaveLength(3)
  })

  it('track never throws on storage errors', () => {
    const originalSet = storage.set.bind(storage)
    storage.set = () => {
      throw new Error('quota')
    }
    expect(() => track('safe_event')).not.toThrow()
    storage.set = originalSet
  })

  it('flushEvents returns empty array when no endpoint configured', () => {
    track('test')
    const flushed = flushEvents()
    expect(flushed).toHaveLength(0)
    expect(getPendingEvents()).toHaveLength(1)
  })

  it('flushEvents keeps events in storage without endpoint', () => {
    track('test_flush')
    const flushed = flushEvents()
    expect(flushed).toHaveLength(0)
    expect(getPendingEvents()).toHaveLength(1)
  })

  it('drops events gracefully on repeated storage failures', () => {
    const originalSet = storage.set.bind(storage)
    let callCount = 0
    storage.set = () => {
      callCount++
      throw new Error('quota')
    }
    track('event1')
    track('event2')
    track('event3')
    storage.set = originalSet
    expect(callCount).toBeGreaterThan(0)
  })

  it('stores events with timestamp', () => {
    const before = Date.now()
    track('timed_event')
    const after = Date.now()
    const events = getPendingEvents()
    expect(events[0]!.timestamp).toBeGreaterThanOrEqual(before)
    expect(events[0]!.timestamp).toBeLessThanOrEqual(after)
  })

  it('getPendingEvents returns empty array when storage is empty', () => {
    expect(getPendingEvents()).toHaveLength(0)
  })
})
