import { describe, it, expect } from 'vitest'
import { APP_MODE, isShowcaseMode, isProductionMode } from '../app-mode'

describe('app-mode', () => {
  it('defaults to production mode when env var is not set', () => {
    // process.env.NEXT_PUBLIC_APP_MODE 在测试环境为 undefined
    expect(APP_MODE).toBe('production')
    expect(isProductionMode).toBe(true)
    expect(isShowcaseMode).toBe(false)
  })
})
