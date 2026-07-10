/**
 * Showcase 题库加载器（M8 Task 2）
 *
 * 从 public/showcase-modules/ 读取 manifest 和 .alc-module.json 文件，
 * 经 parseModulePackage 校验后写入 LocalStorage。
 */

import { parseModulePackage, importModulePackage } from '@/lib/persistence/module-package'
import { storage } from '@/lib/persistence/local-storage'
import type { Module } from '@/types/domain'

/** Manifest 条目 */
export interface ShowcaseManifestEntry {
  id: string
  package: string
  title: string
  description: string
  featured: boolean
  order: number
}

/** Manifest 结构 */
export interface ShowcaseManifest {
  version: number
  modules: ShowcaseManifestEntry[]
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
 * Fetch 单个展示题库 JSON（未解析的原始 JSON 字符串）。
 */
async function fetchShowcasePackage(fileName: string): Promise<string> {
  const res = await fetch(`${MODULE_BASE}/${fileName}`)
  if (!res.ok) throw new Error(`Failed to fetch showcase module ${fileName}: ${res.status}`)
  return res.text()
}

/**
 * 加载展示题库到 LocalStorage。
 *
 * 流程：fetch package JSON → parseModulePackage（6 步校验，含拒绝 apiKey）
 *      → importModulePackage（分配新 ID + 写入 storage）→ 返回 Module
 *
 * 每次调用都分配新 ID，因此同一展示题库可反复加载（每次产生新的本地副本）。
 */
export async function loadShowcaseModuleIntoStorage(entry: ShowcaseManifestEntry): Promise<Module> {
  const rawText = await fetchShowcasePackage(entry.package)
  const result = parseModulePackage(rawText)
  if (!result.ok) {
    throw new Error(`展示题库 ${entry.id} 校验失败: ${result.error}`)
  }
  return importModulePackage(storage, result.pkg)
}

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
