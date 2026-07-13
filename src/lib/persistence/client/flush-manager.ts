/**
 * FlushManager -- 监听浏览器事件触发强制落盘
 *
 * 评审 3.2.3 + 6.1 D11 定案：
 *   - visibilitychange -> hidden 时 flush
 *   - sendBeacon 仅用于小批量（< 64 KB）
 *   - fetch(..., { keepalive: true }) 作为补充
 *   - beforeunload 不作为主要保障（不稳定）
 *
 * 用法：在 StorageInitializer（Phase 3）启动时调用 registerFlushHandlers(repo)，
 * 卸载时调用返回的 cleanup 函数。
 */

export interface FlushHandlers {
  flushNow(): Promise<void>
}

let registered: ((e: Event) => void) | null = null
let registeredHandler: FlushHandlers | null = null

/**
 * 注册全局事件监听器。多次调用幂等（只生效一次）。
 * 返回 cleanup 函数，调用后取消注册。
 */
export function registerFlushHandlers(handler: FlushHandlers): () => void {
  // 如果已经注册过，先注销旧的
  if (registered) {
    document.removeEventListener('visibilitychange', registered)
    window.removeEventListener('beforeunload', registered)
  }
  registeredHandler = handler

  const onVisibilityChange = (_e: Event): void => {
    if (document.visibilityState === 'hidden') {
      // 页面隐藏时触发 flush
      // 注意：此时 await 不一定等到完成，但 keepalive + sendBeacon 兜底
      void handler.flushNow().catch((err: unknown) => {
        console.warn('[FlushManager] visibilitychange hidden flush 失败：', err)
      })
    }
  }

  const onBeforeUnload = (_e: Event): void => {
    // 备用保障（beforeunload 在现代浏览器中不可靠）
    void handler.flushNow().catch(() => {
      // 静默：beforeunload 本来就不可靠
    })
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('beforeunload', onBeforeUnload)
  registered = onVisibilityChange

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('beforeunload', onBeforeUnload)
    registered = null
    registeredHandler = null
  }
}

/** 测试用：手动模拟 visibilitychange -> hidden 事件。 */
export function _simulateHideForTests(): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** 测试用：返回当前注册的 handler（用于断言注册成功）。 */
export function _getRegisteredHandlerForTests(): FlushHandlers | null {
  return registeredHandler
}
