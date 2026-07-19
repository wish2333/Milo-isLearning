import type { StorageRepository } from '../shared/repository'
import { isAlcKey } from '../shared/keys'

import { WriteQueue, type WriteTask } from './write-queue'

/**
 * ClientFetchStorageRepository -- 浏览器端 cache + 写队列
 *
 * 设计（评审 3.2.2 + 3.2.3）：
 *   - 启动时一次性 fetch /api/data/bulk，填充 cache
 *   - 写操作立即更新 cache（同步语义），同时入队 WriteQueue 异步落盘
 *   - 读操作直接走 cache，不打 server
 *   - setRaw 与 set 都通过 WriteQueue.setRaw(key, value) 入队
 *   - 整个 StorageRepository 接口保持同步（评审约束红线 #2）
 *
 * 仅在 production 模式下使用；showcase 用 LocalStorageRepository。
 */

const API_BASE = '/api/data'

// TextEncoder 用于精确计算 UTF-8 字节数。
// 之前 bug：用 string.length（字符数）判断 Chrome keepalive 64 KiB 限制，
// 但中文富数据 UTF-8 字节是字符数 2-3 倍，导致 keepalive 启用时 fetch 立即抛
// "Failed to fetch"（Chrome 不允许 keepalive body > 64 KiB）。
const textEncoder = new TextEncoder()

function utf8Bytes(s: string): number {
  return textEncoder.encode(s).length
}

export class ClientFetchStorageRepository implements StorageRepository {
  // key -> valueRaw（已序列化字符串，不反序列化以保持 valueRaw 一致性）
  private readonly cache = new Map<string, string>()
  private readonly queue: WriteQueue

  constructor() {
    this.queue = new WriteQueue({
      onProcess: async (key: string, value: string | null) => {
        if (value === null) {
          await this.sendDelete(key)
        } else {
          await this.sendPut(key, value)
        }
      },
      // 评审 3.2.3：250ms -> 1s -> 4s
      retryBackoffMs: [250, 1000, 4000],
    })
  }

  /**
   * 从 server 全量加载 cache。仅 production 模式可调用。
   * 由 StorageInitializer（Phase 3）在 mount 时调用一次。
   */
  async loadFromServer(): Promise<void> {
    const res = await fetch(`${API_BASE}/bulk`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`[ClientFetchStorage] /bulk 失败：HTTP ${res.status}`)
    }
    const body = (await res.json()) as {
      entries: Array<[string, string]>
      revision: number
      stats: { totalEntries: number; totalBytes: number }
    }
    this.cache.clear()
    for (const [key, value] of body.entries) {
      this.cache.set(key, value)
    }
  }

  // ----- StorageRepository 实现 -----

  get<T>(key: string): T | null {
    const raw = this.getRaw(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T): void {
    this.setRaw(key, JSON.stringify(value))
  }

  setRaw(key: string, value: string): void {
    // 立即更新 cache（同步），然后入队异步落盘
    this.cache.set(key, value)
    this.queue.enqueue(key, value)
  }

  remove(key: string): void {
    this.cache.delete(key)
    this.queue.enqueue(key, null)
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  keys(): string[] {
    const result: string[] = []
    for (const key of this.cache.keys()) {
      if (isAlcKey(key)) result.push(key)
    }
    return result.sort()
  }

  getRaw(key: string): string | null {
    return this.cache.get(key) ?? null
  }

  clearAll(): void {
    // v1.0.0 修复（review H2）：直接调 /api/data/clear 一次性清空 SQLite，
    // 而不是逐 key 入队 N 个 DELETE。
    // 立即清空 cache（同步语义），server 端清空走 fire-and-forget（与 enqueue 行为一致）。
    this.cache.clear()
    void fetch(`${API_BASE}/clear`, {
      method: 'POST',
      keepalive: true,
    }).catch((err: unknown) => {
      console.warn(
        '[ClientFetchStorage] clearAll 失败：',
        err instanceof Error ? err.message : String(err),
      )
    })
  }

  // ----- 写队列扩展方法 -----

  /** 强制 await 所有 pending 任务（用于关键操作前）。 */
  async flushNow(): Promise<void> {
    await this.queue.flushNow()
  }

  /** 当前失败任务列表（用于 UI 显示）。 */
  getFailedTasks(): WriteTask[] {
    return this.queue.getFailedTasks()
  }

  /** 手动重试所有失败任务（用于 UI 「重试」按钮）。 */
  retryFailed(): void {
    this.queue.retryFailed()
  }

  /** 手动重试指定 key 的失败任务（用于逐项恢复未落盘写入）。 */
  retryOne(key: string): void {
    this.queue.retryOne(key)
  }

  /** 是否有未落盘的 pending 写入。 */
  hasPending(): boolean {
    return this.queue.hasPending()
  }

  // ----- HTTP 发送 -----

  private async sendPut(key: string, value: string): Promise<void> {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: value,
      // Chrome 对 keepalive fetch 有硬限制：body 必须 <= 64 KiB（字节，不是字符）。
      // 超过会立即抛 TypeError "Failed to fetch"。
      // 用 TextEncoder 精确算 UTF-8 字节；超限时不启用 keepalive（让请求走正常流程，
      // 页面卸载可能丢失但有 retry 机制兜底）。
      keepalive: utf8Bytes(value) < 64 * 1024,
    })
    if (!res.ok && res.status !== 204) {
      throw new Error(`PUT ${key} 失败：HTTP ${res.status}`)
    }
  }

  private async sendDelete(key: string): Promise<void> {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      keepalive: true,
    })
    if (!res.ok && res.status !== 204) {
      throw new Error(`DELETE ${key} 失败：HTTP ${res.status}`)
    }
  }
}
