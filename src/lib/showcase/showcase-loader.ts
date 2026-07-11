/**
 * Showcase 题库加载器（M8 Task 2）
 *
 * 从 public/showcase-modules/ 读取 manifest、.alc-module.json、.alc-topic.json，
 * 经校验后写入 LocalStorage（打标 origin: 'showcase'）。
 *
 * 去重：同一展示题库/主题重复点击不会产生副本——按 title/name 匹配已有展示数据。
 */

import { parseModulePackage, importModulePackage } from '@/lib/persistence/module-package'
import { parseTopicPackage, importTopicPackage } from '@/lib/persistence/topic-package'
import { listTopics } from '@/lib/persistence/topic-library'
import { storage } from '@/lib/persistence/local-storage'
import type { Module, Topic } from '@/types/domain'

/** Manifest 条目 */
export interface ShowcaseManifestEntry {
  id: string
  package: string
  title: string
  description: string
  featured: boolean
  order: number
}

/** Manifest v2 主题条目 */
export interface ShowcaseTopicEntry {
  id: string
  name: string
  description: string
  /** .alc-topic.json 文件名（对应 public/showcase-modules/ 下的完整主题包） */
  package: string
  /** 主题内含题库数量（仅用于 UI 展示，实际以包内容为准） */
  moduleCount: number
  featured: boolean
  order: number
}

/** Manifest 结构 */
export interface ShowcaseManifest {
  version: number
  modules: ShowcaseManifestEntry[]
  /** v2 新增：展示主题列表。v1 manifest 无此字段 → 空数组。 */
  topics?: ShowcaseTopicEntry[]
}

/** Featured 题库（模拟编译默认目标） */
export type FeaturedModule = ShowcaseManifestEntry | null

const MANIFEST_PATH = '/showcase-modules/manifest.json'
const MODULE_BASE = '/showcase-modules'

/**
 * Fetch manifest.json。
 * 服务端无缓存（public/ 静态文件由 CDN/浏览器缓存）。
 */
export async function fetchShowcaseManifest(): Promise<ShowcaseManifest> {
  const res = await fetch(MANIFEST_PATH)
  if (!res.ok) throw new Error(`Failed to fetch showcase manifest: ${res.status}`)
  return res.json()
}

/**
 * Fetch 单个展示包 JSON（未解析的原始 JSON 字符串）。
 */
async function fetchShowcasePackage(fileName: string): Promise<string> {
  const res = await fetch(`${MODULE_BASE}/${fileName}`)
  if (!res.ok) throw new Error(`Failed to fetch showcase package ${fileName}: ${res.status}`)
  return res.text()
}

// =================================================================
// 去重工具
// =================================================================

/**
 * 在已存储的展示题库中查找同名 Module。
 * 展示题库的 title 由 manifest 维护，是稳定的——重复点击同一张卡片不会产生副本。
 */
function findExistingShowcaseModule(title: string): Module | null {
  for (const key of storage.keys()) {
    if (!key.startsWith('alc:module:')) continue
    const mod = storage.get<Module>(key)
    if (mod && mod.origin === 'showcase' && mod.title === title) return mod
  }
  return null
}

/**
 * 在已存储的展示主题中查找同名 Topic。
 */
function findExistingShowcaseTopic(name: string): Topic | null {
  return listTopics().find((t) => t.origin === 'showcase' && t.name === name) ?? null
}

// =================================================================
// 加载（带去重）
// =================================================================

/**
 * 加载展示题库到 LocalStorage。
 *
 * 流程：fetch package JSON → parseModulePackage（6 步校验，含拒绝 apiKey）
 *      → importModulePackage（分配新 ID + 写入 storage，打标 origin: 'showcase'）
 *
 * 去重：如果已有同 title 的展示题库，直接返回旧副本，不重复写入。
 */
export async function loadShowcaseModuleIntoStorage(entry: ShowcaseManifestEntry): Promise<Module> {
  const existing = findExistingShowcaseModule(entry.title)
  if (existing) return existing

  const rawText = await fetchShowcasePackage(entry.package)
  const result = parseModulePackage(rawText)
  if (!result.ok) {
    throw new Error(`展示题库 ${entry.id} 校验失败: ${result.error}`)
  }
  return importModulePackage(storage, result.pkg, { origin: 'showcase' })
}

/**
 * 加载展示主题到 LocalStorage。
 *
 * 流程：fetch .alc-topic.json → parseTopicPackage（校验主题包）
 *      → importTopicPackage（逐个导入 module + 创建 topic，打标 origin: 'showcase'）
 *
 * 去重：如果已有同名的展示主题，直接返回旧副本，不重复写入。
 */
export async function loadShowcaseTopicIntoStorage(entry: ShowcaseTopicEntry): Promise<Topic> {
  const rawText = await fetchShowcasePackage(entry.package)
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error(`展示主题 ${entry.id} 不是合法 JSON`)
  }

  const result = parseTopicPackage(parsed)
  if (!result.ok) {
    throw new Error(`展示主题 ${entry.id} 校验失败: ${result.error}`)
  }

  // 去重：用包内的 topic.name 匹配（这是实际写入 storage 的名称）
  const existing = findExistingShowcaseTopic(result.pkg.topic.name)
  if (existing) return existing

  return importTopicPackage(storage, result.pkg, { origin: 'showcase' })
}

// =================================================================
// Manifest 查询
// =================================================================

/**
 * 从 manifest 中找到 featured 题库。
 */
export function findFeaturedModule(manifest: ShowcaseManifest): FeaturedModule {
  return manifest.modules.find((m) => m.featured) ?? manifest.modules[0] ?? null
}

/**
 * 按 order 排序返回所有题库条目。
 */
export function listShowcaseModules(manifest: ShowcaseManifest): ShowcaseManifestEntry[] {
  return [...manifest.modules].sort((a, b) => a.order - b.order)
}

export function listShowcaseTopics(manifest: ShowcaseManifest): ShowcaseTopicEntry[] {
  return [...(manifest.topics ?? [])].sort((a, b) => a.order - b.order)
}

export function findFeaturedTopic(manifest: ShowcaseManifest): ShowcaseTopicEntry | null {
  const topics = listShowcaseTopics(manifest)
  return topics.find((t) => t.featured) ?? topics[0] ?? null
}
