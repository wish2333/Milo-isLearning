/**
 * FIFO 写队列（评审 3.2.3）
 *
 * 核心规则：
 *   - 单队列，不并发（一个任务发完再发下一个）
 *   - per-key 合并：同 key 连续写 A->B，最终只发 B（不丢更新但去冗余）
 *   - operationId 递增，保证全局顺序
 *   - 自动重试 3 次（250ms / 1s / 4s），第 3 次失败进入 failed 状态
 *   - failed 任务保留，UI 显示「保存失败」+ 手动重试
 *   - flushNow() 等待所有 pending 完成（用于关键操作前）
 *
 * 任务状态机：pending -> sending -> done（消失）| failed（保留）
 */

export interface WriteTask {
  operationId: number
  key: string
  value: string | null // null = delete
  attempts: number
  status: 'pending' | 'sending' | 'failed'
}

interface WriteQueueOptions {
  /** 实际发送函数。null value 表示 delete。抛错触发重试。 */
  onProcess: (key: string, value: string | null) => Promise<void>
  /** 重试退避数组（毫秒）。第 N 次失败后等 retryBackoffMs[N-1] 再重试。 */
  retryBackoffMs: number[]
}

export class WriteQueue {
  // 同 key 只保留最新 task（per-key 合并）
  private readonly pending = new Map<string, WriteTask>()
  // 失败任务也按 key 索引（手动重试用）
  private readonly failed = new Map<string, WriteTask>()
  private nextOperationId = 0
  private processing = false
  private readonly onProcess: WriteQueueOptions['onProcess']
  private readonly retryBackoffMs: readonly number[]
  // flushNow 的等待者：当队列进入 idle 时通知所有等待者
  private readonly flushWaiters: Array<() => void> = []

  constructor(opts: WriteQueueOptions) {
    this.onProcess = opts.onProcess
    this.retryBackoffMs = opts.retryBackoffMs
  }

  /**
   * 入队一个写入。同 key 已有 pending task 则覆盖（合并）。
   * 同 key 已有 failed task 也覆盖（用户接受了上次失败，本次是新写入）。
   */
  enqueue(key: string, value: string | null): void {
    const operationId = this.nextOperationId++
    const task: WriteTask = {
      operationId,
      key,
      value,
      attempts: 0,
      status: 'pending',
    }
    this.pending.set(key, task)
    // 同 key 的 failed 也清掉（本次新写入取代旧失败）
    this.failed.delete(key)
    // 触发处理（不阻塞 enqueue）
    void this.processNext()
  }

  /**
   * 等待所有 pending 完成。失败任务不阻塞 flushNow（它们已经进入 failed 状态）。
   *
   * v1.0.0 修复（review M2）：用 Promise resolver 替代 10ms 轮询，
   * 避免在 server 慢时浪费 CPU。
   */
  async flushNow(): Promise<void> {
    // 快速路径：已经 idle
    if (!this.processing && this.pending.size === 0) return
    // 等待 processNext 在 finally 中触发 notifyIdle
    await new Promise<void>((resolve) => {
      this.flushWaiters.push(resolve)
    })
  }

  /** 是否有 pending 任务（用于 UI 显示「未保存数据」）。 */
  hasPending(): boolean {
    return this.pending.size > 0 || this.processing
  }

  /** 当前失败任务列表。 */
  getFailedTasks(): WriteTask[] {
    return Array.from(this.failed.values()).sort((a, b) => a.operationId - b.operationId)
  }

  /** 手动重试所有失败任务。 */
  retryFailed(): void {
    for (const task of this.failed.values()) {
      task.status = 'pending'
      task.attempts = 0
      this.pending.set(task.key, task)
    }
    this.failed.clear()
    void this.processNext()
  }

  // ----- 内部 -----

  /** 取下一个 pending 任务（按 operationId 升序）。 */
  private pickNext(): WriteTask | null {
    if (this.pending.size === 0) return null
    let next: WriteTask | null = null
    for (const task of this.pending.values()) {
      if (next === null || task.operationId < next.operationId) {
        next = task
      }
    }
    return next
  }

  private async processNext(): Promise<void> {
    if (this.processing) return // 已经在处理
    const task = this.pickNext()
    if (!task) {
      this.notifyIdle()
      return
    }
    this.processing = true
    this.pending.delete(task.key)
    task.status = 'sending'

    try {
      // 让同步 enqueue 合并有时间生效（微任务延迟）
      await new Promise((r) => setTimeout(r, 0))
      // 如果同 key 已被新 enqueue 覆盖（更新的 operationId），跳过本次发送
      const currentPending = this.pending.get(task.key)
      if (currentPending && currentPending.operationId > task.operationId) {
        return
      }
      await this.onProcess(task.key, task.value)
      // done 任务从所有追踪中消失
    } catch (err) {
      task.attempts++
      const maxAttempts = this.retryBackoffMs.length
      if (task.attempts >= maxAttempts) {
        // 进入 failed 状态
        task.status = 'failed'
        this.failed.set(task.key, task)
      } else {
        // 安排重试：等 backoff 后重新入队
        const backoff = this.retryBackoffMs[task.attempts - 1] ?? 1000
        setTimeout(() => {
          task.status = 'pending'
          this.pending.set(task.key, task)
          void this.processNext()
        }, backoff)
      }
      // 错误信息仅记录日志，不上抛（写队列自治）
      console.warn(
        `[WriteQueue] ${task.key} 第 ${task.attempts} 次失败：`,
        err instanceof Error ? err.message : String(err),
      )
    } finally {
      this.processing = false
      // 继续处理下一个
      if (this.pending.size > 0) {
        void this.processNext()
      } else {
        this.notifyIdle()
      }
    }
  }

  /**
   * 通知所有 flushNow 等待者：队列已 idle。
   * v1.0.0 修复（review M2）：替代 10ms 轮询。
   */
  private notifyIdle(): void {
    if (this.processing || this.pending.size > 0) return
    while (this.flushWaiters.length > 0) {
      const resolve = this.flushWaiters.shift()
      if (resolve) resolve()
    }
  }
}
