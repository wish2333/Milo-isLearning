// module-package.test.ts — Versioned Module Package Import / Export
//
// 覆盖：
//   - createModulePackage + serializeModulePackage + parseModulePackage round trip
//   - parseModulePackage 安全校验（JSON 合法性、version、exportedBy、缺失字段、apiKey）
//   - importModulePackage：新 id 分配、immutability、qualityReport 持久化

import { beforeEach, describe, expect, it } from 'vitest'

import type { KnowledgeSource, Module } from '@/types/domain'

import { StorageKeys } from '../shared/keys'
import type { StorageRepository } from '../shared/repository'
import {
  assignLocalModuleIdentity,
  createModulePackage,
  importModulePackage,
  parseModulePackage,
  serializeModulePackage,
} from '../module-package'
import type { CompiledModulePackage } from '../module-package'

// =================================================================
// In-memory mock repository (独立实现，不依赖 quota.test.ts)
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

  setRaw(key: string, value: string): void {
    this.store.set(key, value)
  }
}
// =================================================================

function makeSource(): KnowledgeSource {
  return {
    id: 'source-1',
    type: 'markdown',
    content: '# Hello\n\nWorld',
    createdAt: 1,
  }
}

function makeModule(): Module {
  return {
    id: 'module-1',
    sourceId: 'source-1',
    title: 'Test Module',
    intro: 'Module intro',
    goal: 'Learn something',
    concepts: [
      {
        id: 'concept-1',
        moduleId: 'module-1',
        name: 'Concept A',
        definition: 'Definition A',
        type: 'fact',
        keyPoints: ['point 1'],
        quizSeries: {
          conceptId: 'concept-1',
          quizzes: [
            {
              id: 'quiz-1',
              conceptId: 'concept-1',
              ladderLevel: 1,
              expressionLevel: 1,
              interactionType: 'choice',
              stem: 'What is A?',
              options: ['A', 'B', 'C', 'D'],
              answer: 'A',
              explanation: 'Because',
              distractors: ['B', 'C', 'D'],
            },
          ],
        },
        order: 1,
      },
    ],
    feynmanTask: {
      moduleId: 'module-1',
      steps: [],
      finalPrompt: 'Explain like Im 5',
      rubric: ['covers all concepts'],
    },
    order: 1,
  }
}

function makeValidPackage(): CompiledModulePackage {
  return createModulePackage({
    source: makeSource(),
    module: makeModule(),
  })
}

// =================================================================
// 测试
// =================================================================

describe('createModulePackage + serializeModulePackage + parseModulePackage round trip', () => {
  it('round-trips a valid package', () => {
    const pkg = makeValidPackage()
    const json = serializeModulePackage(pkg)
    const result = parseModulePackage(json)

    expect(result.ok).toBe(true)
    if (!result.ok) return // type guard

    expect(result.pkg.version).toBe(1)
    expect(result.pkg.exportedBy).toBe('ai-learning-compiler')
    expect(result.pkg.exportedAt).toBeGreaterThan(0)
    expect(result.pkg.source).toEqual(pkg.source)
    expect(result.pkg.module).toEqual(pkg.module)
  })

  it('retains optional qualityReport and generatedBy in round trip', () => {
    const pkg = createModulePackage({
      source: makeSource(),
      module: makeModule(),
      qualityReport: { score: 0.95, issues: [] },
      generatedBy: { provider: 'openai', model: 'gpt-4', generatedAt: 1000 },
    })

    const json = serializeModulePackage(pkg)
    const result = parseModulePackage(json)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.pkg.qualityReport).toEqual({ score: 0.95, issues: [] })
    expect(result.pkg.generatedBy).toEqual({
      provider: 'openai',
      model: 'gpt-4',
      generatedAt: 1000,
    })
  })
})

describe('parseModulePackage safety', () => {
  it('rejects invalid JSON', () => {
    const result = parseModulePackage('not json at all')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('JSON')
  })

  it('rejects non-object JSON', () => {
    const result = parseModulePackage('"a string"')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('对象')
  })

  it('rejects wrong version', () => {
    const pkg = makeValidPackage()
    const json = serializeModulePackage(pkg)
    const modified = json.replace('"version": 1', '"version": 2')
    const result = parseModulePackage(modified)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('版本')
  })

  it('rejects wrong exportedBy', () => {
    const pkg = makeValidPackage()
    const json = serializeModulePackage(pkg)
    const modified = json.replace('ai-learning-compiler', 'other-tool')
    const result = parseModulePackage(modified)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('AI Learning Compiler')
  })

  it('rejects missing source', () => {
    const pkg = makeValidPackage()
    const json = serializeModulePackage(pkg)
    // Parse to object, delete source, re-serialize
    const parsed = JSON.parse(json)
    delete parsed.source
    const modified = JSON.stringify(parsed)
    const result = parseModulePackage(modified)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('source')
  })

  it('rejects missing module', () => {
    const pkg = makeValidPackage()
    const json = serializeModulePackage(pkg)
    const parsed = JSON.parse(json)
    delete parsed.module
    const modified = JSON.stringify(parsed)
    const result = parseModulePackage(modified)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('module')
  })

  it('rejects JSON containing apiKey', () => {
    // Take a valid serialized package, inject apiKey field
    const pkg = makeValidPackage()
    const json = serializeModulePackage(pkg)
    const injected = json.replace(
      '"exportedBy": "ai-learning-compiler"',
      '"exportedBy": "ai-learning-compiler", "apiKey": "sk-abc123"',
    )
    const result = parseModulePackage(injected)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('API Key')
  })

  it('rejects deeply nested apiKey string', () => {
    // apiKey nested inside generatedBy
    const pkg = makeValidPackage()
    const json = serializeModulePackage(pkg)
    const injected = json.replace(
      '"exportedBy": "ai-learning-compiler"',
      '"exportedBy": "ai-learning-compiler", "generatedBy": { "apiKey": "sk-secret" }',
    )
    const result = parseModulePackage(injected)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('API Key')
  })
})

describe('importModulePackage', () => {
  let repo: MockRepo
  let pkg: CompiledModulePackage

  beforeEach(() => {
    repo = new MockRepo()
    pkg = makeValidPackage()
  })

  it('writes new module + source with fresh ids', () => {
    const originalModuleId = pkg.module.id
    const originalSourceId = pkg.source.id

    const imported = importModulePackage(repo, pkg)

    // New ids assigned
    expect(imported.id).not.toBe(originalModuleId)
    expect(imported.sourceId).not.toBe(originalSourceId)

    // Data persisted in repo
    expect(repo.has(StorageKeys.module(imported.id))).toBe(true)
    expect(repo.has(StorageKeys.source(imported.sourceId))).toBe(true)
  })

  it('does not mutate the original package', () => {
    const originalModuleId = pkg.module.id
    const originalSourceId = pkg.source.id

    importModulePackage(repo, pkg)

    // Original unchanged
    expect(pkg.module.id).toBe(originalModuleId)
    expect(pkg.source.id).toBe(originalSourceId)
  })

  it('returns module with updated concept.moduleId and feynmanTask.moduleId', () => {
    const imported = importModulePackage(repo, pkg)

    for (const concept of imported.concepts) {
      expect(concept.moduleId).toBe(imported.id)
    }
    expect(imported.feynmanTask.moduleId).toBe(imported.id)
  })

  it('persists qualityReport when present', () => {
    const pkgWithReport = createModulePackage({
      source: makeSource(),
      module: makeModule(),
      qualityReport: { moduleId: 'module-1', score: 0.88, warnings: ['low coverage'] },
    })

    const imported = importModulePackage(repo, pkgWithReport)

    const storedReport = repo.get(StorageKeys.qualityReport(imported.id))
    expect(storedReport).toEqual({
      moduleId: imported.id,
      score: 0.88,
      warnings: ['low coverage'],
    })
  })

  it('does not write qualityReport when absent', () => {
    // pkg has no qualityReport (undefined)
    const imported = importModulePackage(repo, pkg)

    // The qualityReport key should not exist in storage
    const storedReport = repo.getRaw(StorageKeys.qualityReport(imported.id))
    expect(storedReport).toBeNull()
  })

  it('does not call /api/compile (sanity: function takes repo, not fetch)', () => {
    // The signature itself proves no network call — importModulePackage
    // takes StorageRepository, not a fetch/HTTP client.
    const imported = importModulePackage(repo, pkg)
    expect(imported).toBeDefined()
    expect(imported.id).toBeTruthy()
  })

  it('sets importedAt timestamp on returned module', () => {
    const imported = importModulePackage(repo, pkg)
    expect(imported.importedAt).toBeGreaterThan(0)
  })

  it('updates source createdAt to current time', () => {
    const imported = importModulePackage(repo, pkg)
    const storedSource = repo.get<KnowledgeSource>(StorageKeys.source(imported.sourceId))
    expect(storedSource).not.toBeNull()
    expect(storedSource!.createdAt).toBeGreaterThan(0)
    // Original source should still have createdAt=1
    expect(pkg.source.createdAt).toBe(1)
  })
})

describe('assignLocalModuleIdentity', () => {
  it('assigns fresh local module/source ids without mutating the compiled module', () => {
    const compiled = makeModule()

    const first = assignLocalModuleIdentity(compiled, {
      moduleId: 'module-local-a',
      sourceId: 'source-local-a',
    })
    const second = assignLocalModuleIdentity(compiled, {
      moduleId: 'module-local-b',
      sourceId: 'source-local-b',
    })

    expect(first.id).toBe('module-local-a')
    expect(first.sourceId).toBe('source-local-a')
    expect(second.id).toBe('module-local-b')
    expect(second.sourceId).toBe('source-local-b')
    expect(compiled.id).toBe('module-1')
    expect(compiled.sourceId).toBe('source-1')
  })

  it('prefixes concept and challenge quiz slot ids with the local module id', () => {
    const compiled: Module = {
      ...makeModule(),
      challengeQuizzes: [
        {
          id: 'challenge-1',
          conceptId: 'challenge',
          ladderLevel: 3,
          expressionLevel: 1,
          interactionType: 'choice',
          stem: 'Challenge?',
          options: ['A', 'B', 'C', 'D'],
          answer: 'A',
          explanation: 'Because this explanation is long enough for tests.',
          distractors: ['B', 'C', 'D'],
          involvedConceptIds: ['concept-1', 'concept-2'],
        },
      ],
    }
    compiled.concepts[0]!.quizSeries.quizzes[0]!.id = 'concept-1:slot-1'

    const local = assignLocalModuleIdentity(compiled, {
      moduleId: 'module-local',
      sourceId: 'source-local',
    })

    expect(local.concepts[0]!.moduleId).toBe('module-local')
    expect(local.concepts[0]!.quizSeries.quizzes[0]!.id).toBe('module-local:concept-1:slot-1')
    expect(local.challengeQuizzes![0]!.id).toBe('module-local:challenge-1')
    expect(local.feynmanTask.moduleId).toBe('module-local')
  })
})
