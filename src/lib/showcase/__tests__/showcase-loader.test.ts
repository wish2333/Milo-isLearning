import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock storage and module-package before importing the module under test
vi.mock('@/lib/persistence/local-storage', () => ({
  storage: {
    set: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    keys: vi.fn().mockReturnValue([]),
  },
}))

vi.mock('@/lib/persistence/module-package', () => ({
  parseModulePackage: vi.fn(),
  importModulePackage: vi.fn(),
}))

import {
  fetchShowcaseManifest,
  loadShowcaseModuleIntoStorage,
  findFeaturedModule,
  listShowcaseModules,
} from '../showcase-loader'
import { parseModulePackage, importModulePackage } from '@/lib/persistence/module-package'
import { storage } from '@/lib/persistence/local-storage'
import type { ShowcaseManifest } from '../showcase-loader'

// Helper to create mock manifest
const mockManifest: ShowcaseManifest = {
  version: 1,
  modules: [
    {
      id: 'a',
      package: 'a.json',
      title: 'A',
      description: 'Desc A',
      featured: false,
      order: 2,
    },
    {
      id: 'b',
      package: 'b.json',
      title: 'B',
      description: 'Desc B',
      featured: true,
      order: 1,
    },
    {
      id: 'c',
      package: 'c.json',
      title: 'C',
      description: 'Desc C',
      featured: false,
      order: 3,
    },
  ],
}

describe('showcase-loader', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Re-establish storage mocks (restoreAllMocks resets vi.fn implementations)
    vi.mocked(storage.keys).mockReturnValue([])
  })

  describe('fetchShowcaseManifest', () => {
    it('fetches and parses manifest successfully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockManifest),
        }),
      )
      const manifest = await fetchShowcaseManifest()
      expect(manifest.version).toBe(1)
      expect(manifest.modules).toHaveLength(3)
    })

    it('throws on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
      await expect(fetchShowcaseManifest()).rejects.toThrow()
    })
  })

  describe('findFeaturedModule', () => {
    it('returns the featured entry', () => {
      const featured = findFeaturedModule(mockManifest)
      expect(featured?.id).toBe('b')
    })

    it('falls back to first module if none featured', () => {
      const noFeatured: ShowcaseManifest = {
        version: 1,
        modules: mockManifest.modules.map((m) => ({ ...m, featured: false })),
      }
      const result = findFeaturedModule(noFeatured)
      expect(result?.id).toBe('a')
    })

    it('returns null for empty modules', () => {
      const empty: ShowcaseManifest = { version: 1, modules: [] }
      expect(findFeaturedModule(empty)).toBeNull()
    })
  })

  describe('listShowcaseModules', () => {
    it('sorts by order field', () => {
      const sorted = listShowcaseModules(mockManifest)
      expect(sorted.map((m) => m.id)).toEqual(['b', 'a', 'c'])
    })
  })

  describe('loadShowcaseModuleIntoStorage', () => {
    it('parses and imports package successfully', async () => {
      const mockModule = { id: 'module-123', title: 'Test' }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve('{"version":1}'),
        }),
      )
      vi.mocked(parseModulePackage).mockReturnValue({
        ok: true,
        pkg: {} as any,
      })
      vi.mocked(importModulePackage).mockReturnValue(mockModule as any)

      const entry = mockManifest.modules[1]!
      const result = await loadShowcaseModuleIntoStorage(entry)
      expect(result).toEqual(mockModule)
      expect(importModulePackage).toHaveBeenCalledOnce()
    })

    it('throws when parseModulePackage fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          text: () => Promise.resolve('invalid'),
        }),
      )
      vi.mocked(parseModulePackage).mockReturnValue({
        ok: false,
        error: '文件不是合法 JSON',
      })

      const entry = mockManifest.modules[0]!
      await expect(loadShowcaseModuleIntoStorage(entry)).rejects.toThrow(
        '展示题库 a 校验失败: 文件不是合法 JSON',
      )
    })

    it('throws on non-ok fetch response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
      const entry = mockManifest.modules[0]!
      await expect(loadShowcaseModuleIntoStorage(entry)).rejects.toThrow()
    })
  })
})
