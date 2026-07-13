import { describe, it, expect } from 'vitest'

import {
  buildBackupPackage,
  serializeBackupPackage,
  parseBackupPackage,
  computeChecksum,
  sanitizeEntriesForExport,
  countModulesInEntries,
  type BackupEntryV1,
  type BackupPackageV1,
} from '../backup-package'

describe('BackupPackage checksum', () => {
  it('长度前缀编码：相同 entries 不同字段顺序仍得到同一 checksum', () => {
    const entriesA: BackupEntryV1[] = [
      { key: 'alc:a', valueRaw: '1', namespace: 'a', updatedAt: 100 },
      { key: 'alc:b', valueRaw: '2', namespace: 'b', updatedAt: 200 },
    ]
    const entriesB: BackupEntryV1[] = [
      { key: 'alc:b', valueRaw: '2', namespace: 'b', updatedAt: 200 },
      { key: 'alc:a', valueRaw: '1', namespace: 'a', updatedAt: 100 },
    ]
    expect(computeChecksum(entriesA)).toBe(computeChecksum(entriesB))
  })

  it('长度前缀避免歧义：a|bc vs ab|c 不同', () => {
    const e1: BackupEntryV1[] = [{ key: 'a', valueRaw: 'bc', namespace: '', updatedAt: 1 }]
    const e2: BackupEntryV1[] = [{ key: 'ab', valueRaw: 'c', namespace: '', updatedAt: 1 }]
    expect(computeChecksum(e1)).not.toBe(computeChecksum(e2))
  })
})

describe('buildBackupPackage + serialize + parse round-trip', () => {
  it('round-trip：valueRaw 不变', () => {
    const entries: Array<[string, string]> = [
      ['alc:module:m1', '{"id":"m1"}'],
      ['alc:settings', '{"provider":"deepseek"}'],
    ]
    const pkg = buildBackupPackage({
      entries,
      appMode: 'production',
      schemaVersion: 1,
      moduleCount: 1,
    })
    const json = serializeBackupPackage(pkg)
    const parsed = parseBackupPackage(json)

    expect(parsed.version).toBe(1)
    expect(parsed.appMode).toBe('production')
    expect(parsed.entries).toHaveLength(2)
    expect(parsed.entries[0]!.valueRaw).toBe('{"id":"m1"}')
    expect(parsed.entries[1]!.valueRaw).toBe('{"provider":"deepseek"}')
  })

  it('parse 拒绝 checksum 不匹配', () => {
    const entries: Array<[string, string]> = [['alc:a', '1']]
    const pkg = buildBackupPackage({
      entries,
      appMode: 'production',
      schemaVersion: 1,
      moduleCount: 0,
    })
    const tampered: BackupPackageV1 = {
      ...pkg,
      meta: { ...pkg.meta, checksum: '0'.repeat(64) },
    }
    const json = JSON.stringify(tampered)
    expect(() => parseBackupPackage(json)).toThrow(/checksum/i)
  })

  it('parse 拒绝非 JSON', () => {
    expect(() => parseBackupPackage('not json')).toThrow(/JSON/)
  })

  it('parse 拒绝 schema 不匹配', () => {
    const badPkg = { version: 999 }
    expect(() => parseBackupPackage(JSON.stringify(badPkg))).toThrow()
  })

  it('buildBackupPackage 过滤非 alc: key', () => {
    const entries: Array<[string, string]> = [
      ['alc:module:m1', '{}'],
      ['some:other:key', '{}'],
      ['random', '{}'],
    ]
    const pkg = buildBackupPackage({
      entries,
      appMode: 'production',
      schemaVersion: 1,
      moduleCount: 0,
    })
    expect(pkg.entries).toHaveLength(1)
    expect(pkg.entries[0]!.key).toBe('alc:module:m1')
  })
})

describe('sanitizeEntriesForExport', () => {
  it('剔除 alc:settings 中的 apiKey / availableKeys 字段', () => {
    const entries: Array<[string, string]> = [
      [
        'alc:settings',
        JSON.stringify({
          state: {
            config: { provider: 'deepseek', apiKey: 'sk-secret' },
            availableKeys: { deepseek: 'sk-1', glm: 'sk-2' },
          },
        }),
      ],
      ['alc:module:m1', '{"id":"m1"}'],
    ]
    const result = sanitizeEntriesForExport(entries)
    const settingsParsed = JSON.parse(result[0]![1]) as {
      state: { config: { provider: string; apiKey?: string }; availableKeys?: unknown }
    }
    expect(settingsParsed.state.config.provider).toBe('deepseek')
    expect(settingsParsed.state.config.apiKey).toBeUndefined()
    expect(settingsParsed.state.availableKeys).toBeUndefined()
    expect(result[1]).toEqual(['alc:module:m1', '{"id":"m1"}'])
  })

  it('递归剔除嵌套对象中的 apiKey', () => {
    const entries: Array<[string, string]> = [
      [
        'alc:settings',
        JSON.stringify({
          state: {
            nested: { deep: { apiKey: 'sk-x', keep: 'me' } },
          },
        }),
      ],
    ]
    const result = sanitizeEntriesForExport(entries)
    const parsed = JSON.parse(result[0]![1]) as {
      state: { nested: { deep: { apiKey?: string; keep: string } } }
    }
    expect(parsed.state.nested.deep.apiKey).toBeUndefined()
    expect(parsed.state.nested.deep.keep).toBe('me')
  })

  it('alc:settings JSON 解析失败时保留原样', () => {
    const entries: Array<[string, string]> = [['alc:settings', '{not valid json']]
    const result = sanitizeEntriesForExport(entries)
    expect(result[0]![1]).toBe('{not valid json')
  })

  it('非 settings 的 entry 不受影响（即使 value 含 apiKey 字符串）', () => {
    const entries: Array<[string, string]> = [
      ['alc:source:s1', JSON.stringify({ content: '设置 apiKey 的方法是...' })],
    ]
    const result = sanitizeEntriesForExport(entries)
    expect(result[0]![1]).toBe(JSON.stringify({ content: '设置 apiKey 的方法是...' }))
  })
})

describe('countModulesInEntries', () => {
  it('正确数 alc:module: 数量', () => {
    const entries: Array<[string, string]> = [
      ['alc:module:m1', '{}'],
      ['alc:module:m2', '{}'],
      ['alc:settings', '{}'],
      ['alc:source:s1', '{}'],
    ]
    expect(countModulesInEntries(entries)).toBe(2)
  })

  it('空列表返回 0', () => {
    expect(countModulesInEntries([])).toBe(0)
  })
})
