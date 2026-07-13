import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted: 这些变量必须在 vi.mock 工厂之前可用（工厂会被提升到文件顶部）
const { loadFromServerMock, flushNowMock, registerFlushHandlersMock, showcaseModeRef } = vi.hoisted(
  () => ({
    loadFromServerMock: vi.fn().mockResolvedValue(undefined),
    flushNowMock: vi.fn().mockResolvedValue(undefined),
    registerFlushHandlersMock: vi.fn().mockReturnValue(() => {}),
    showcaseModeRef: { value: false },
  }),
)

// mock client-only（client-only 包在 SSR/Node 下抛错）
vi.mock('client-only', () => ({}))

// mock 6 个 store 的 persist.rehydrate（避免实际加载状态）
vi.mock('@/lib/state/progress-store', () => ({
  useProgressStore: { persist: { rehydrate: vi.fn().mockResolvedValue(undefined) } },
}))
vi.mock('@/lib/state/settings-store', () => ({
  useSettingsStore: { persist: { rehydrate: vi.fn().mockResolvedValue(undefined) } },
}))
vi.mock('@/lib/state/attempts-store', () => ({
  useAttemptsStore: { persist: { rehydrate: vi.fn().mockResolvedValue(undefined) } },
}))
vi.mock('@/lib/state/module-store', () => ({
  useModuleStore: { persist: { rehydrate: vi.fn().mockResolvedValue(undefined) } },
}))
vi.mock('@/lib/state/rating-store', () => ({
  useRatingStore: { persist: { rehydrate: vi.fn().mockResolvedValue(undefined) } },
}))
vi.mock('@/lib/state/topic-session-store', () => ({
  useTopicSessionStore: { persist: { rehydrate: vi.fn().mockResolvedValue(undefined) } },
}))

// mock storage / flush-manager
vi.mock('@/lib/persistence/client/storage', () => ({
  getProductionStorage: () => ({
    loadFromServer: loadFromServerMock,
    flushNow: flushNowMock,
  }),
}))
vi.mock('@/lib/persistence/client/flush-manager', () => ({
  registerFlushHandlers: registerFlushHandlersMock,
}))

// 控制 isShowcaseMode
vi.mock('@/lib/runtime/app-mode', () => ({
  get isShowcaseMode() {
    return showcaseModeRef.value
  },
}))

import {
  initClientStorage,
  getStorageInitState,
  getStorageInitError,
  retryInit,
  _resetForTests,
} from '../client/storage-initializer'

describe('StorageInitializer', () => {
  beforeEach(() => {
    _resetForTests()
    showcaseModeRef.value = false
    loadFromServerMock.mockClear()
    loadFromServerMock.mockResolvedValue(undefined)
    registerFlushHandlersMock.mockClear()
    registerFlushHandlersMock.mockReturnValue(() => {})
  })

  it('showcase 模式立即返回 resolved，无副作用', async () => {
    showcaseModeRef.value = true
    await initClientStorage()
    expect(getStorageInitState()).toBe('ready')
    expect(loadFromServerMock).not.toHaveBeenCalled()
  })

  it('production 模式：idle -> loading -> ready', async () => {
    const promise = initClientStorage()
    expect(getStorageInitState()).toBe('loading')
    await promise
    expect(getStorageInitState()).toBe('ready')
    expect(getStorageInitError()).toBeNull()
  })

  it('production 模式调用 loadFromServer + rehydrate + registerFlushHandlers', async () => {
    await initClientStorage()
    expect(loadFromServerMock).toHaveBeenCalledTimes(1)
    expect(registerFlushHandlersMock).toHaveBeenCalledTimes(1)
  })

  it('幂等：多次调用共享同一个 Promise', async () => {
    const p1 = initClientStorage()
    const p2 = initClientStorage()
    expect(p1).toBe(p2)
    await p1
    expect(loadFromServerMock).toHaveBeenCalledTimes(1)
  })

  it('失败时进入 error 状态，记录错误信息', async () => {
    loadFromServerMock.mockRejectedValueOnce(new Error('network down'))
    await expect(initClientStorage()).rejects.toThrow('network down')
    expect(getStorageInitState()).toBe('error')
    expect(getStorageInitError()).toBe('network down')
  })

  it('error 状态可通过 retryInit 恢复', async () => {
    loadFromServerMock.mockRejectedValueOnce(new Error('first fail'))
    await expect(initClientStorage()).rejects.toThrow()
    expect(getStorageInitState()).toBe('error')

    loadFromServerMock.mockResolvedValueOnce(undefined)
    await retryInit()
    expect(getStorageInitState()).toBe('ready')
  })

  it('ready 状态下 retryInit 是 no-op', async () => {
    await initClientStorage()
    expect(getStorageInitState()).toBe('ready')
    await retryInit()
    expect(loadFromServerMock).toHaveBeenCalledTimes(1) // 没多调用
  })
})
