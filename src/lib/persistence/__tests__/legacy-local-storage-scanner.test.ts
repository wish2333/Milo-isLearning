import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('client-only', () => ({}))

import {
  collectLegacyEntries,
  computeFingerprintAsync,
  filterShowcaseOrigin,
  isMigrated,
  markMigrated,
  markDismissed,
  shouldShowMigrationPrompt,
  MIGRATED_AT_KEY,
  DISMISSED_AT_KEY,
  scanLegacyLocalStorage,
} from '../client/legacy-local-storage-scanner'
import type { ScannedEntry } from '../client/legacy-local-storage-scanner'

// mock localStorage
const ls = new Map<string, string>()
const localStorageMock = {
  // length 用 getter 动态计算，避免测试直接 ls.set 时 stale
  get length(): number {
    return ls.size
  },
  clear: () => {
    ls.clear()
  },
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => {
    ls.set(k, v)
  },
  key: (i: number) => Array.from(ls.keys())[i] ?? null,
  removeItem: (k: string) => {
    ls.delete(k)
  },
}
vi.stubGlobal('localStorage', localStorageMock)

beforeEach(() => {
  ls.clear()
  // vitest config 有 unstubGlobals: true，每次测试后 stub 会被还原；
  // 重新 stub 确保 localStorage 在每个测试中都可用。
  vi.stubGlobal('localStorage', localStorageMock)
})

describe('collectLegacyEntries', () => {
  it('空 LS 返回空 entries + 空 moduleIds', () => {
    const result = collectLegacyEntries()
    expect(result.entries).toEqual([])
    expect(result.moduleIds).toEqual([])
  })

  it('收集静态 key + 动态前缀 key', () => {
    ls.set('alc:settings', '{}')
    ls.set('alc:ratings', '{}')
    ls.set('alc:module:m1', '{"id":"m1"}')
    ls.set('alc:source:s1', 'markdown content')
    ls.set('alc:progress:m1', '{}')
    ls.set('non-alc-key', 'ignore me')

    const result = collectLegacyEntries()
    expect(result.entries).toHaveLength(5)
    expect(result.moduleIds).toEqual(['m1'])
  })

  it('排除 alc:runtime-mode（sessionStorage 不迁移）', () => {
    ls.set('alc:runtime-mode', '{"studioMode":true}')
    const result = collectLegacyEntries()
    expect(result.entries).toEqual([])
  })

  it('排除 marker key 自身', () => {
    ls.set('alc:migrated-at', '12345')
    ls.set('alc:migration-dismissed-at', '67890')
    const result = collectLegacyEntries()
    expect(result.entries).toEqual([])
  })

  it('包含 alc:state:attempts 全局表', () => {
    ls.set(
      'alc:state:attempts',
      JSON.stringify({
        state: { attemptsBySlot: { 'm1:slot1': { foo: 1 } } },
        version: 1,
      }),
    )
    const result = collectLegacyEntries()
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.key).toBe('alc:state:attempts')
  })

  it('不匹配任何前缀的 alc key 被跳过', () => {
    ls.set('alc:compile-job:j1', '{}')
    ls.set('alc:attempts:q1', '[]')
    const result = collectLegacyEntries()
    expect(result.entries).toEqual([])
  })
})

describe('computeFingerprintAsync', () => {
  it('空 entries 返回空字符串', async () => {
    const fp = await computeFingerprintAsync([])
    expect(fp).toBe('')
  })

  it('非空 entries 返回 64 位 hex', async () => {
    const entries: ScannedEntry[] = [{ key: 'alc:settings', valueRaw: '{}', namespace: 'settings' }]
    const fp = await computeFingerprintAsync(entries)
    expect(fp).toMatch(/^[a-f0-9]{64}$/)
  })

  it('相同 entries 生成相同 fingerprint', async () => {
    const entries: ScannedEntry[] = [
      { key: 'alc:settings', valueRaw: '{"a":1}', namespace: 'settings' },
    ]
    const fp1 = await computeFingerprintAsync(entries)
    const fp2 = await computeFingerprintAsync([...entries])
    expect(fp1).toBe(fp2)
  })

  it('不同 value 生成不同 fingerprint', async () => {
    const e1: ScannedEntry[] = [{ key: 'alc:settings', valueRaw: '{"a":1}', namespace: 'settings' }]
    const e2: ScannedEntry[] = [{ key: 'alc:settings', valueRaw: '{"a":2}', namespace: 'settings' }]
    const fp1 = await computeFingerprintAsync(e1)
    const fp2 = await computeFingerprintAsync(e2)
    expect(fp1).not.toBe(fp2)
  })
})

describe('scanLegacyLocalStorage', () => {
  it('空 LS 返回空 entries + 空 fingerprint', async () => {
    const result = await scanLegacyLocalStorage()
    expect(result.entries).toEqual([])
    expect(result.sourceFingerprint).toBe('')
  })

  it('有 entries 时 fingerprint 非空', async () => {
    ls.set('alc:settings', '{}')
    const result = await scanLegacyLocalStorage()
    expect(result.entries).toHaveLength(1)
    expect(result.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('filterShowcaseOrigin', () => {
  it('includeShowcase=true 保留所有', () => {
    const entries: ScannedEntry[] = [
      { key: 'alc:module:m1', valueRaw: '{"origin":"showcase"}', namespace: 'module' },
      { key: 'alc:module:m2', valueRaw: '{"origin":"user"}', namespace: 'module' },
    ]
    expect(filterShowcaseOrigin(entries, true)).toHaveLength(2)
  })

  it('includeShowcase=false 排除 showcase origin Module 及关联数据', () => {
    const entries: ScannedEntry[] = [
      { key: 'alc:module:m1', valueRaw: '{"origin":"showcase"}', namespace: 'module' },
      { key: 'alc:module:m2', valueRaw: '{"origin":"user"}', namespace: 'module' },
      { key: 'alc:progress:m1', valueRaw: '{}', namespace: 'progress' },
      { key: 'alc:progress:m2', valueRaw: '{}', namespace: 'progress' },
    ]
    const result = filterShowcaseOrigin(entries, false)
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.key)).toEqual(['alc:module:m2', 'alc:progress:m2'])
  })

  it('Module JSON 损坏时保留条目（保守策略）', () => {
    const entries: ScannedEntry[] = [
      { key: 'alc:module:m1', valueRaw: '{not valid json', namespace: 'module' },
    ]
    const result = filterShowcaseOrigin(entries, false)
    expect(result).toHaveLength(1)
  })

  it('无 showcase Module 时原样返回', () => {
    const entries: ScannedEntry[] = [
      { key: 'alc:module:m1', valueRaw: '{"origin":"user"}', namespace: 'module' },
      { key: 'alc:module:m2', valueRaw: '{}', namespace: 'module' },
    ]
    const result = filterShowcaseOrigin(entries, false)
    expect(result).toHaveLength(2)
  })

  it('关联完整性：排除 showcase Module 的 mastery/feynman/quality', () => {
    const entries: ScannedEntry[] = [
      { key: 'alc:module:show1', valueRaw: '{"origin":"showcase"}', namespace: 'module' },
      { key: 'alc:mastery:show1', valueRaw: '{}', namespace: 'mastery' },
      { key: 'alc:feynman:show1', valueRaw: '{}', namespace: 'feynman' },
      { key: 'alc:quality:show1', valueRaw: '{}', namespace: 'quality' },
      { key: 'alc:attempts-module:show1', valueRaw: '{}', namespace: 'attempts-module' },
      { key: 'alc:module:real1', valueRaw: '{"origin":"user"}', namespace: 'module' },
      { key: 'alc:mastery:real1', valueRaw: '{}', namespace: 'mastery' },
    ]
    const result = filterShowcaseOrigin(entries, false)
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.key)).toEqual(['alc:module:real1', 'alc:mastery:real1'])
  })

  it('静态 key 和全局表不受 showcase 过滤影响', () => {
    const entries: ScannedEntry[] = [
      { key: 'alc:settings', valueRaw: '{}', namespace: 'settings' },
      { key: 'alc:state:attempts', valueRaw: '{}', namespace: 'state' },
    ]
    const result = filterShowcaseOrigin(entries, false)
    expect(result).toHaveLength(2)
  })
})

describe('markers', () => {
  it('markMigrated + isMigrated', () => {
    expect(isMigrated()).toBe(false)
    markMigrated()
    expect(isMigrated()).toBe(true)
    expect(ls.get(MIGRATED_AT_KEY)).toBeTruthy()
  })

  it('markMigrated 清除 dismissed-at', () => {
    ls.set(DISMISSED_AT_KEY, '100')
    markMigrated()
    expect(ls.has(DISMISSED_AT_KEY)).toBe(false)
  })

  it('markDismissed 写 dismissed-at', () => {
    markDismissed()
    expect(ls.get(DISMISSED_AT_KEY)).toBeTruthy()
  })
})

describe('shouldShowMigrationPrompt', () => {
  it('entries 空 -> false', () => {
    expect(
      shouldShowMigrationPrompt({
        entries: [],
        sourceFingerprint: '',
        moduleIds: [],
        dismissedAt: null,
      }),
    ).toBe(false)
  })

  it('dismissedAt=null -> true', () => {
    expect(
      shouldShowMigrationPrompt({
        entries: [{ key: 'a', valueRaw: 'b', namespace: 'a' }],
        sourceFingerprint: 'x',
        moduleIds: [],
        dismissedAt: null,
      }),
    ).toBe(true)
  })

  it('dismissedAt 在 7 天内 -> false', () => {
    expect(
      shouldShowMigrationPrompt({
        entries: [{ key: 'a', valueRaw: 'b', namespace: 'a' }],
        sourceFingerprint: 'x',
        moduleIds: [],
        dismissedAt: Date.now() - 1000 * 60 * 60,
      }),
    ).toBe(false)
  })

  it('dismissedAt 超过 7 天 -> true', () => {
    expect(
      shouldShowMigrationPrompt({
        entries: [{ key: 'a', valueRaw: 'b', namespace: 'a' }],
        sourceFingerprint: 'x',
        moduleIds: [],
        dismissedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      }),
    ).toBe(true)
  })
})
