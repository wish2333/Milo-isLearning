/**
 * 轻量埋点系统（M7.8 / FR-09 前置）— 双轨模式
 *
 * track() 同步入队到内存 buffer，自动注入 app_mode。
 * flush() 按 APP_MODE 分轨：
 *   - production: POST /api/events（失败时重新入队重试）
 *   - showcase:  写入 LocalStorage（保持原有行为）
 *
 * 不阻塞主流程，LocalStorage 写入失败时丢弃最旧事件。
 */

import { APP_MODE, isProductionMode } from '@/lib/runtime/app-mode'
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
const EVENTS_ENDPOINT = '/api/events'

let buffer: AnalyticsEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/** Read pending events from LocalStorage */
export function getPendingEvents(): AnalyticsEvent[] {
  if (!isBrowser()) return []
  return storage.get<AnalyticsEvent[]>(STORAGE_KEY) ?? []
}

/** Showcase: persist batch to LocalStorage (existing M7.8 behavior) */
function persistToLocal(batch: AnalyticsEvent[]): void {
  try {
    const events = getPendingEvents()
    events.push(...batch)

    try {
      storage.set(STORAGE_KEY, events)
    } catch {
      const trimmed = events.slice(Math.floor(events.length / 2))
      try {
        storage.set(STORAGE_KEY, trimmed)
      } catch {
        // Still failing -- give up silently
      }
    }
  } catch {
    // Analytics must NEVER throw or block UI
  }
}

/** Enqueue an analytics event. Synchronous, <1ms, never throws. */
export function track(name: string, props?: AnalyticsEvent['props']): void {
  if (!isBrowser()) return

  const event: AnalyticsEvent = {
    name,
    props: { ...props, app_mode: APP_MODE },
    timestamp: Date.now(),
  }

  buffer.push(event)

  if (buffer.length >= BATCH_SIZE) {
    flush()
  } else {
    ensureFlushTimer()
  }
}

/**
 * Flush buffered events. Branches by APP_MODE:
 *   - production: POST /api/events; re-buffer on failure
 *   - showcase:  write to LocalStorage
 */
export async function flush(): Promise<void> {
  if (!isBrowser()) return
  if (buffer.length === 0) return

  const batch = buffer.splice(0)

  if (isProductionMode) {
    try {
      const response = await fetch(EVENTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: batch.map((e) => ({
            name: e.name,
            props: e.props,
            occurredAt: e.timestamp,
          })),
        }),
      })
      if (!response.ok) {
        // Re-buffer on failure for next flush attempt
        buffer.unshift(...batch)
      }
    } catch {
      // Network error: re-buffer for retry
      buffer.unshift(...batch)
    }
  } else {
    persistToLocal(batch)
  }
}

/** Backwards-compatible sync flush wrapper */
export function flushEvents(): AnalyticsEvent[] {
  // Legacy sync API -- no-op under dual-track; events are in buffer or LS
  return []
}

function ensureFlushTimer(): void {
  if (flushTimer !== null) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, FLUSH_INTERVAL_MS)
}

/** For testing: reset internal state */
export function _resetForTesting(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  buffer = []
}
