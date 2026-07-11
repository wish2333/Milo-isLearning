/**
 * Compiled Topic Package — 主题整体导出/导入格式 (M8.1 Task 10)
 *
 * 单 JSON 文件，内含 topic 元数据 + 有序的 CompiledModulePackage[]。
 * 导入时重新分配所有 ID（module + source + quiz），
 * 并创建本地 Topic 关联新的 moduleId 列表。
 */

import type { Topic } from '@/types/domain'
import type { CompiledModulePackage } from './module-package'
import { importModulePackage, parseModulePackage } from './module-package'
import { createTopic } from './topic-library'
import type { StorageRepository } from './repository'

// =================================================================
// 类型
// =================================================================

export interface CompiledTopicPackage {
  version: 1
  exportedBy: 'ai-learning-compiler'
  exportedAt: number
  topic: {
    name: string
    description?: string
  }
  /** 有序模块数组，顺序 = 主题刷题顺序 */
  modules: CompiledModulePackage[]
}

export type ParseTopicPackageResult =
  { ok: true; pkg: CompiledTopicPackage } | { ok: false; error: string }

// =================================================================
// 导出
// =================================================================

export function createTopicPackage(args: {
  topic: Topic
  modulePackages: CompiledModulePackage[]
}): CompiledTopicPackage {
  return {
    version: 1,
    exportedBy: 'ai-learning-compiler',
    exportedAt: Date.now(),
    topic: {
      name: args.topic.name,
      description: args.topic.description,
    },
    modules: args.modulePackages,
  }
}

export function serializeTopicPackage(pkg: CompiledTopicPackage): string {
  return JSON.stringify(pkg, null, 2)
}

// =================================================================
// 解析（导入前校验）
// =================================================================

export function parseTopicPackage(raw: unknown): ParseTopicPackageResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '主题包格式无效：期望对象' }
  }
  const obj = raw as Record<string, unknown>

  if (obj.version !== 1) {
    return { ok: false, error: `不支持的主题包版本：${String(obj.version)}` }
  }
  if (obj.exportedBy !== 'ai-learning-compiler') {
    return { ok: false, error: '主题包来源不明' }
  }
  if (!obj.topic || typeof obj.topic !== 'object') {
    return { ok: false, error: '主题包缺少 topic 元数据' }
  }
  const topicMeta = obj.topic as Record<string, unknown>
  if (typeof topicMeta.name !== 'string' || topicMeta.name.trim() === '') {
    return { ok: false, error: '主题名称无效' }
  }

  if (!Array.isArray(obj.modules) || obj.modules.length === 0) {
    return { ok: false, error: '主题包模块列表为空' }
  }

  // 安全检查：整个 JSON 字符串不含 apiKey
  const jsonStr = JSON.stringify(raw)
  if (jsonStr.includes('"apiKey"')) {
    return { ok: false, error: '主题包包含敏感信息（apiKey），已拒绝' }
  }

  // 逐个校验模块包（parseModulePackage 接受 string 参数）
  for (let i = 0; i < obj.modules.length; i++) {
    const moduleJson = JSON.stringify(obj.modules[i])
    const moduleResult = parseModulePackage(moduleJson)
    if (!moduleResult.ok) {
      return { ok: false, error: `模块 #${i + 1} 校验失败：${moduleResult.error}` }
    }
  }

  return { ok: true, pkg: raw as CompiledTopicPackage }
}

// =================================================================
// 导入
// =================================================================

export function importTopicPackage(repo: StorageRepository, pkg: CompiledTopicPackage): Topic {
  const newModuleIds: string[] = []

  for (const modulePkg of pkg.modules) {
    const mod = importModulePackage(repo, modulePkg)
    newModuleIds.push(mod.id)
  }

  return createTopic(pkg.topic.name, pkg.topic.description, newModuleIds)
}

// =================================================================
// 浏览器下载
// =================================================================

export function downloadTopicPackage(pkg: CompiledTopicPackage): void {
  const json = serializeTopicPackage(pkg)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeName = pkg.topic.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || 'topic'
  a.download = `${safeName}.alc-topic.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
