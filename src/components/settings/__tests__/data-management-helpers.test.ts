import { describe, it, expect } from 'vitest'
import { formatBytes, formatFileTimestamp } from '../DataManagement'

describe('formatBytes', () => {
  it('returns raw bytes for values under 1024', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('returns KB with 1 decimal for values under 1 MB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024 - 1)).toMatch(/\d+\.\d KB/)
  })

  it('returns MB with 2 decimals for values >= 1 MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB')
    expect(formatBytes(1024 * 1024 * 50)).toBe('50.00 MB')
  })
})

describe('formatFileTimestamp', () => {
  it('produces YYYYMMDD-HHmmss format', () => {
    const ts = formatFileTimestamp(new Date(2026, 6, 13, 14, 5, 9))
    expect(ts).toBe('20260713-140509')
  })

  it('pads single-digit month/day/hour/minute/second with leading zeros', () => {
    const ts = formatFileTimestamp(new Date(2026, 0, 1, 1, 1, 1))
    expect(ts).toBe('20260101-010101')
  })
})
