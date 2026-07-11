// topic-package.test.ts — Topic Package Export / Import (M8.1 Task 10)
//
// 覆盖：
//   - createTopicPackage + serializeTopicPackage + parseTopicPackage round trip
//   - parseTopicPackage 安全校验（非对象、version、exportedBy、topic、modules、apiKey）
//   - importTopicPackage：调用 importModulePackage + createTopic
//   - 模块级校验失败传播

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Module, Topic } from '@/types/domain'

import type { StorageRepository } from '../repository'
import {
  createTopicPackage,
  importTopicPackage,
  parseTopicPackage,
  serializeTopicPackage,
} from '../topic-package'
import type { CompiledTopicPackage } from '../topic-package'

// =================================================================
// Mocks
// =================================================================

vi.mock('@/lib/persistence/module-package', () => ({
  parseModulePackage: vi.fn(),
  importModulePackage: vi.fn(),
}))

vi.mock('@/lib/persistence/topic-library', () => ({
  createTopic: vi.fn(),
}))

import { parseModulePackage, importModulePackage } from '@/lib/persistence/module-package'
import { createTopic } from '@/lib/persistence/topic-library'

const mockParseModulePackage = vi.mocked(parseModulePackage)
const mockImportModulePackage = vi.mocked(importModulePackage)
const mockCreateTopic = vi.mocked(createTopic)

// =================================================================
// In-memory mock repository
// =================================================================

class MockRepo implements StorageRepository {
  private store = new Map<string, string>()

  get<T>(key: string): T | null {
    const raw = this.store.get(key)
    if (raw === undefined) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, JSON.stringify(value))
  }

  remove(key: string): void {
    this.store.delete(key)
  }

  has(key: string): boolean {
    return this.store.has(key)
  }

  keys(): string[] {
    return [...this.store.keys()].filter((k) => k.startsWith('alc:'))
  }

  getRaw(key: string): string | null {
    return this.store.get(key) ?? null
  }

  clearAll(): void {
    this.store.clear()
  }
}

// =================================================================
// Fixtures
// =================================================================

function makeValidTopicPackage(): CompiledTopicPackage {
  return {
    version: 1,
    exportedBy: 'ai-learning-compiler',
    exportedAt: Date.now(),
    topic: {
      name: 'Test Topic',
      description: 'A test topic',
    },
    modules: [
      {
        version: 1,
        exportedBy: 'ai-learning-compiler',
        exportedAt: Date.now(),
        source: {
          id: 'source-1',
          type: 'markdown',
          content: '# Hello',
          createdAt: 1,
        },
        module: {
          id: 'module-1',
          sourceId: 'source-1',
          title: 'Test Module',
          intro: 'Intro',
          goal: 'Goal',
          concepts: [],
          feynmanTask: { moduleId: 'module-1', steps: [], finalPrompt: '', rubric: [] },
          order: 1,
        },
      },
    ],
  }
}

function makeTopic(): Topic {
  return {
    id: 'topic-abc',
    name: 'My Topic',
    description: 'Desc',
    moduleIds: ['module-1'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// =================================================================
// Tests
// =================================================================

describe('createTopicPackage', () => {
  it('produces correct structure', () => {
    const topic = makeTopic()
    const pkg = createTopicPackage({ topic, modulePackages: [] })

    expect(pkg.version).toBe(1)
    expect(pkg.exportedBy).toBe('ai-learning-compiler')
    expect(pkg.exportedAt).toBeGreaterThan(0)
    expect(pkg.topic.name).toBe('My Topic')
    expect(pkg.topic.description).toBe('Desc')
    expect(pkg.modules).toEqual([])
  })
})

describe('serializeTopicPackage + parseTopicPackage round trip', () => {
  beforeEach(() => {
    mockParseModulePackage.mockReturnValue({ ok: true, pkg: makeValidTopicPackage().modules[0]! })
  })

  it('round-trips successfully', () => {
    const topic = makeTopic()
    const pkg = createTopicPackage({ topic, modulePackages: makeValidTopicPackage().modules })
    const json = serializeTopicPackage(pkg)
    const result = parseTopicPackage(JSON.parse(json))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.pkg.version).toBe(1)
    expect(result.pkg.exportedBy).toBe('ai-learning-compiler')
    expect(result.pkg.topic.name).toBe('My Topic')
    expect(result.pkg.modules).toHaveLength(1)
  })
})

describe('parseTopicPackage safety', () => {
  beforeEach(() => {
    mockParseModulePackage.mockReturnValue({ ok: true, pkg: makeValidTopicPackage().modules[0]! })
  })

  it('rejects null', () => {
    expect(parseTopicPackage(null).ok).toBe(false)
  })

  it('rejects array', () => {
    expect(parseTopicPackage([]).ok).toBe(false)
  })

  it('rejects string', () => {
    expect(parseTopicPackage('not json').ok).toBe(false)
  })

  it('rejects version !== 1', () => {
    const pkg = makeValidTopicPackage()
    const modified = { ...pkg, version: 2 }
    const result = parseTopicPackage(modified)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('版本')
  })

  it('rejects wrong exportedBy', () => {
    const pkg = { ...makeValidTopicPackage(), exportedBy: 'evil-tool' as const }
    const result = parseTopicPackage(pkg)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('来源不明')
  })

  it('rejects missing topic', () => {
    const pkg = makeValidTopicPackage()
    const { topic: _, ...rest } = pkg
    const result = parseTopicPackage(rest)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('topic')
  })

  it('rejects empty topic name', () => {
    const pkg = makeValidTopicPackage()
    const modified = { ...pkg, topic: { name: '   ' } }
    const result = parseTopicPackage(modified)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('名称无效')
  })

  it('rejects missing modules array', () => {
    const pkg = makeValidTopicPackage()
    const { modules: _, ...rest } = pkg
    const result = parseTopicPackage(rest)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('模块')
  })

  it('rejects empty modules array', () => {
    const pkg = { ...makeValidTopicPackage(), modules: [] }
    const result = parseTopicPackage(pkg)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('模块')
  })

  it('rejects JSON containing apiKey', () => {
    const pkg = makeValidTopicPackage()
    const result = parseTopicPackage({ ...pkg, apiKey: 'sk-abc' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('apiKey')
  })

  it('rejects when a module validation fails', () => {
    mockParseModulePackage.mockReturnValue({ ok: false, error: '模块缺少 source' })
    const pkg = makeValidTopicPackage()
    const result = parseTopicPackage(pkg)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('模块 #1')
    expect(result.error).toContain('模块缺少 source')
  })
})

describe('importTopicPackage', () => {
  let repo: MockRepo

  beforeEach(() => {
    repo = new MockRepo()
    vi.clearAllMocks()
    mockImportModulePackage.mockReturnValue({
      id: 'new-module-1',
      sourceId: 'new-source-1',
    } as unknown as Module)
    mockCreateTopic.mockReturnValue({
      id: 'new-topic-1',
      name: 'Test Topic',
      moduleIds: ['new-module-1'],
      createdAt: 1,
      updatedAt: 1,
    })
  })

  it('imports each module and creates topic', () => {
    const pkg = makeValidTopicPackage()
    const topic = importTopicPackage(repo, pkg)

    expect(mockImportModulePackage).toHaveBeenCalledTimes(1)
    expect(mockImportModulePackage).toHaveBeenCalledWith(repo, pkg.modules[0], undefined)
    expect(mockCreateTopic).toHaveBeenCalledWith(
      'Test Topic',
      'A test topic',
      ['new-module-1'],
      undefined,
    )
    expect(topic.id).toBe('new-topic-1')
  })

  it('imports multiple modules in order', () => {
    mockImportModulePackage
      .mockReturnValueOnce({ id: 'mod-a' } as unknown as Module)
      .mockReturnValueOnce({ id: 'mod-b' } as unknown as Module)
    mockCreateTopic.mockReturnValue({
      id: 'topic-2',
      name: 'T',
      moduleIds: ['mod-a', 'mod-b'],
      createdAt: 1,
      updatedAt: 1,
    })

    const basePkg = makeValidTopicPackage()
    const mod0 = basePkg.modules[0]!
    const multiPkg: CompiledTopicPackage = {
      ...basePkg,
      modules: [
        { ...mod0, module: { ...mod0.module, id: 'm1' } },
        { ...mod0, module: { ...mod0.module, id: 'm2' } },
      ],
    }

    importTopicPackage(repo, multiPkg)

    expect(mockImportModulePackage).toHaveBeenCalledTimes(2)
    expect(mockCreateTopic).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      ['mod-a', 'mod-b'],
      undefined,
    )
  })
})
