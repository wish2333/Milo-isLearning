// fill-blank.test.ts — Fill Blank 标准化匹配单测
//
// 覆盖：
//   - normalizeFillBlankAnswer: 全角/半角/大小写/空白折叠
//   - isFillBlankCorrect: 精确匹配命中与不命中边界

import { describe, expect, it } from 'vitest'

import { isFillBlankCorrect, normalizeFillBlankAnswer } from '../fill-blank'

// =================================================================
// normalizeFillBlankAnswer
// =================================================================

describe('normalizeFillBlankAnswer', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizeFillBlankAnswer('  hello  ')).toBe('hello')
  })

  it('converts to lowercase', () => {
    expect(normalizeFillBlankAnswer('HelloWorld')).toBe('helloworld')
  })

  it('folds consecutive whitespace into single space', () => {
    expect(normalizeFillBlankAnswer('a   b\t\nc')).toBe('a b c')
  })

  it('converts full-width ASCII to half-width', () => {
    // 全角字母 A-F (FF21-FF26) → 半角 a-f
    expect(normalizeFillBlankAnswer('\uFF21\uFF22\uFF23')).toBe('abc')
  })

  it('converts full-width space (ideographic) to half-width', () => {
    expect(normalizeFillBlankAnswer('\u3000hello\u3000')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(normalizeFillBlankAnswer('')).toBe('')
  })

  it('handles whitespace-only string', () => {
    expect(normalizeFillBlankAnswer('   ')).toBe('')
  })
})

// =================================================================
// isFillBlankCorrect
// =================================================================

describe('isFillBlankCorrect', () => {
  it('returns true for exact match', () => {
    expect(isFillBlankCorrect('TCP', 'TCP')).toBe(true)
  })

  it('returns true ignoring case', () => {
    expect(isFillBlankCorrect('tcp', 'TCP')).toBe(true)
  })

  it('returns true ignoring leading/trailing whitespace', () => {
    expect(isFillBlankCorrect('  TCP  ', 'TCP')).toBe(true)
  })

  it('returns true with full-width input converted', () => {
    // 全角 ABC → 半角 abc, 正确答案也是 abc
    expect(isFillBlankCorrect('\uFF21\uFF22\uFF23', 'abc')).toBe(true)
  })

  it('returns true with internal whitespace difference', () => {
    expect(isFillBlankCorrect('HTTP  2.0', 'HTTP 2.0')).toBe(true)
  })

  it('returns false for different answers', () => {
    expect(isFillBlankCorrect('TCP', 'UDP')).toBe(false)
  })

  it('returns false for partial match', () => {
    expect(isFillBlankCorrect('Transmission Control', 'TCP')).toBe(false)
  })

  it('returns false for empty user answer', () => {
    expect(isFillBlankCorrect('', 'TCP')).toBe(false)
  })

  it('returns false for whitespace-only user answer', () => {
    expect(isFillBlankCorrect('   ', 'TCP')).toBe(false)
  })

  it('returns false when correct answer is empty but user is not', () => {
    expect(isFillBlankCorrect('something', '')).toBe(false)
  })

  it('handles Chinese characters correctly', () => {
    expect(isFillBlankCorrect('面向对象', '面向对象')).toBe(true)
  })

  it('handles mixed Chinese and English', () => {
    expect(isFillBlankCorrect('  RESTful API  ', 'RESTful API')).toBe(true)
  })
})
