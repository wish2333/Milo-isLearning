import { describe, it, expect } from 'vitest'
import { _parseStatusResponseForTests } from '../useStorageStats'

describe('_parseStatusResponseForTests', () => {
  it('解析完整响应', () => {
    const result = _parseStatusResponseForTests({
      enabled: true,
      schemaVersion: 1,
      totalEntries: 42,
      totalBytes: 1024,
    })
    expect(result).toEqual({
      enabled: true,
      schemaVersion: 1,
      totalEntries: 42,
      totalBytes: 1024,
    })
  })

  it('缺字段时填默认值', () => {
    const result = _parseStatusResponseForTests({ enabled: false })
    expect(result).toEqual({
      enabled: false,
      schemaVersion: 0,
      totalEntries: 0,
      totalBytes: 0,
    })
  })

  it('非对象抛错', () => {
    expect(() => _parseStatusResponseForTests(null)).toThrow()
    expect(() => _parseStatusResponseForTests('string')).toThrow()
  })
})
