import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AnalyticsModule from '../analytics'

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

// Default to showcase mode; production tests use vi.doMock + dynamic import
vi.mock('@/lib/runtime/app-mode', () => ({
  APP_MODE: 'showcase',
  isShowcaseMode: true,
  isProductionMode: false,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { track, flush, flushEvents, getPendingEvents, _resetForTesting } from '../analytics'
import { storage } from '@/lib/persistence/client/local-storage'

describe('analytics (showcase mode)', () => {
  beforeEach(() => {
    nodeStorage.clear()
    _resetForTesting()
    mockFetch.mockReset()
  })

  it('flushes buffered events to LocalStorage', async () => {
    track('test_event', { foo: 'bar' })
    // Events are in buffer, not LS yet
    expect(getPendingEvents()).toHaveLength(0)

    await flush()
    const events = getPendingEvents()
    expect(events).toHaveLength(1)
    expect(events[0]!.name).toBe('test_event')
    expect(events[0]!.props?.foo).toBe('bar')
  })

  it('injects app_mode into every event', async () => {
    track('mode_test', { key: 'val' })
    await flush()
    const events = getPendingEvents()
    expect(events[0]!.props?.app_mode).toBe('showcase')
  })

  it('handles multiple events flushed together', async () => {
    track('event_a')
    track('event_b', { num: 42 })
    track('event_c', { flag: true })
    await flush()
    const events = getPendingEvents()
    expect(events).toHaveLength(3)
    expect(events[1]!.props?.num).toBe(42)
    expect(events[2]!.props?.flag).toBe(true)
  })

  it('track never throws on storage errors', () => {
    const originalSet = storage.set.bind(storage)
    storage.set = () => {
      throw new Error('quota')
    }
    expect(() => track('safe_event')).not.toThrow()
    storage.set = originalSet
  })

  it('drops events gracefully on repeated storage failures during flush', async () => {
    const originalSet = storage.set.bind(storage)
    storage.set = () => {
      throw new Error('quota')
    }
    track('event1')
    track('event2')
    await flush()
    // flush consumed buffer, LS write failed silently
    storage.set = originalSet
    expect(getPendingEvents()).toHaveLength(0)
  })

  it('stores events with timestamp', async () => {
    const before = Date.now()
    track('timed_event')
    await flush()
    const after = Date.now()
    const events = getPendingEvents()
    expect(events[0]!.timestamp).toBeGreaterThanOrEqual(before)
    expect(events[0]!.timestamp).toBeLessThanOrEqual(after)
  })

  it('getPendingEvents returns empty array when storage is empty', () => {
    expect(getPendingEvents()).toHaveLength(0)
  })

  it('flush is a no-op when buffer is empty', async () => {
    await flush()
    expect(getPendingEvents()).toHaveLength(0)
  })

  it('flushEvents returns empty array (legacy sync API no-op)', () => {
    const result = flushEvents()
    expect(result).toHaveLength(0)
  })
})

describe('analytics (production mode)', () => {
  let analytics: typeof AnalyticsModule

  beforeEach(async () => {
    nodeStorage.clear()
    mockFetch.mockReset()
    // Ensure fetch mock is active after resetModules
    globalThis.fetch = mockFetch as unknown as typeof fetch

    // Re-import analytics with production mode mocked
    vi.doMock('@/lib/runtime/app-mode', () => ({
      APP_MODE: 'production',
      isShowcaseMode: false,
      isProductionMode: true,
    }))
    vi.resetModules()
    analytics = await import('../analytics')
    analytics._resetForTesting()
  })

  afterEach(() => {
    vi.doUnmock('@/lib/runtime/app-mode')
    vi.resetModules()
  })

  it('POSTs events to /api/events with correct payload', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    analytics.track('prod_event', { source: 'api' })
    await analytics.flush()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    })

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string)
    expect(body.events).toHaveLength(1)
    expect(body.events[0]!.name).toBe('prod_event')
    expect(body.events[0]!.props.source).toBe('api')
    expect(body.events[0]!.props.app_mode).toBe('production')
    expect(body.events[0]!.occurredAt).toBeTypeOf('number')
  })

  it('injects app_mode: production into production events', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    analytics.track('check_mode')
    await analytics.flush()

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string)
    expect(body.events[0]!.props.app_mode).toBe('production')
  })

  it('clears buffer after successful POST', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    analytics.track('success_event')
    await analytics.flush()

    // Second flush should be a no-op (buffer was cleared)
    await analytics.flush()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('re-buffers events on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    analytics.track('fail_event')
    await analytics.flush()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Next flush should retry
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await analytics.flush()
    expect(mockFetch).toHaveBeenCalledTimes(2)

    const retryBody = JSON.parse(mockFetch.mock.calls[1]![1]!.body as string)
    expect(retryBody.events[0]!.name).toBe('fail_event')
  })

  it('re-buffers events on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    analytics.track('network_fail')
    await analytics.flush()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Next flush should retry
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })
    await analytics.flush()
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('does not write production events to LocalStorage', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 })

    analytics.track('prod_ls_test')
    await analytics.flush()

    expect(analytics.getPendingEvents()).toHaveLength(0)
  })

  it('flush is a no-op when buffer is empty', async () => {
    await analytics.flush()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
