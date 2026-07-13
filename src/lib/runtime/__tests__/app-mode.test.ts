import { describe, it, expect } from 'vitest'
import { APP_MODE, isShowcaseMode, isProductionMode } from '../app-mode'

describe('app-mode', () => {
  it('defaults to showcase mode when env var is not set', () => {
    // process.env.NEXT_PUBLIC_APP_MODE 在测试环境为 undefined
    // v1.0.0 默认 showcase（与 server 端 isStorageEnabled 的 fail-closed 行为一致）
    expect(APP_MODE).toBe('showcase')
    expect(isShowcaseMode).toBe(true)
    expect(isProductionMode).toBe(false)
  })
})
