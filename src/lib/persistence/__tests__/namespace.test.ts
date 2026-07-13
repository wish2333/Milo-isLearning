import { describe, it, expect } from 'vitest'
import { parseNamespace } from '../shared/namespace'

describe('parseNamespace', () => {
  it('提取一级 namespace', () => {
    expect(parseNamespace('alc:module:m1')).toBe('module')
    expect(parseNamespace('alc:state:progress')).toBe('state')
    expect(parseNamespace('alc:compile-job:job-abc')).toBe('compile-job')
  })

  it('key 缺少第二段时返回空字符串', () => {
    expect(parseNamespace('alc:')).toBe('')
    expect(parseNamespace('alc')).toBe('')
  })

  it('无 alc 前缀也能提取第二段（namespace 函数不校验前缀）', () => {
    expect(parseNamespace('foo:bar:baz')).toBe('bar')
  })
})
