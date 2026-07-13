/**
 * 轻量埋点系统（M7.8 / FR-09 前置）
 *
 * 同步入队 → LocalStorage 批量缓冲 → 满 BATCH_SIZE 或 FLUSH_INTERVAL 到期时
 * 尝试 navigator.sendBeacon（仅在配置了上报端点时）。
 * 不阻塞主流程，LocalStorage 写入失败时丢弃最旧事件。
 */

import { StorageKeys } from '@/lib/persistence/shared/keys'
import { storage } from '@/lib/persistence/client/local-storage'

export interface AnalyticsEvent {
  name: string
  props?: Record<string, string | number | boolean | null | undefined>
  timestamp: number
}

const BATCH_SIZE = 20
const FLUSH_INTERVAL_MS = 30_000
const STORAGE_KEY = StorageKeys.events

/** 上报端点（未配置时只存 LocalStorage） */
const ENDPOINT: string | undefined = undefined

let flushTimer: ReturnType<typeof setTimeout> | null = null

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/** Read pending events from LocalStorage */
export function getPendingEvents(): AnalyticsEvent[] {
  if (!isBrowser()) return []
  return storage.get<AnalyticsEvent[]>(STORAGE_KEY) ?? []
}

/** Enqueue an analytics event. Synchronous, <1ms, never throws. */
export function track(name: string, props?: AnalyticsEvent['props']): void {
  if (!isBrowser()) return

  const event: AnalyticsEvent = { name, props, timestamp: Date.now() }

  try {
    const events = getPendingEvents()
    events.push(event)

    try {
      storage.set(STORAGE_KEY, events)
    } catch {
      const trimmed = events.slice(Math.floor(events.length / 2))
      try {
        storage.set(STORAGE_KEY, trimmed)
      } catch {
        // Still failing — give up silently
      }
    }

    if (events.length >= BATCH_SIZE) {
      flushEvents()
    } else {
      ensureFlushTimer()
    }
  } catch {
    // Analytics must NEVER throw or block UI
  }
}

/** Flush all pending events via sendBeacon (if endpoint configured). Returns flushed events. */
export function flushEvents(): AnalyticsEvent[] {
  if (!isBrowser()) return []

  const events = getPendingEvents()
  if (events.length === 0) return []

  if (ENDPOINT && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      const body = JSON.stringify({ events })
      const success = navigator.sendBeacon(ENDPOINT, body)
      if (success) {
        storage.set(STORAGE_KEY, [])
        return events
      }
    } catch {
      // sendBeacon failed — keep events in buffer for next attempt
    }
  }

  // No endpoint or sendBeacon failed — events stay in LocalStorage
  return []
}

function ensureFlushTimer(): void {
  if (flushTimer !== null) return
  if (!ENDPOINT) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushEvents()
  }, FLUSH_INTERVAL_MS)
}

/** For testing: reset internal state */
export function _resetForTesting(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}
