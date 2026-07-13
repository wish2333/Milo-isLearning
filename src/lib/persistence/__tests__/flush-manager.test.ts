/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  registerFlushHandlers,
  _simulateHideForTests,
  _getRegisteredHandlerForTests,
} from '../client/flush-manager'

describe('registerFlushHandlers', () => {
  let cleanup: (() => void) | null

  beforeEach(() => {
    cleanup = null
  })

  afterEach(() => {
    if (cleanup) cleanup()
    cleanup = null
  })

  it('注册后 visibilitychange=hidden 触发 flushNow', async () => {
    const flushNow = vi.fn().mockResolvedValue(undefined)
    cleanup = registerFlushHandlers({ flushNow })
    _simulateHideForTests()
    // 等微任务
    await new Promise((r) => setTimeout(r, 50))
    expect(flushNow).toHaveBeenCalledTimes(1)
  })

  it('cleanup 后不再触发', async () => {
    const flushNow = vi.fn().mockResolvedValue(undefined)
    cleanup = registerFlushHandlers({ flushNow })
    cleanup()
    cleanup = null
    _simulateHideForTests()
    await new Promise((r) => setTimeout(r, 50))
    expect(flushNow).not.toHaveBeenCalled()
  })

  it('_getRegisteredHandlerForTests 返回当前注册的 handler', () => {
    const flushNow = vi.fn().mockResolvedValue(undefined)
    // 确保没有残留 handler（上一个测试的 afterEach 已清理）
    const existing = _getRegisteredHandlerForTests()
    if (existing) {
      // 前一个测试可能还没执行 afterEach，手动清理
      document.removeEventListener('visibilitychange', () => {})
      window.removeEventListener('beforeunload', () => {})
    }
    expect(_getRegisteredHandlerForTests()).toBeNull()
    cleanup = registerFlushHandlers({ flushNow })
    expect(_getRegisteredHandlerForTests()).not.toBeNull()
  })
})
