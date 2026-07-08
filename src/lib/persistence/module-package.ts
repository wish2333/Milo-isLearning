/**
 * Compiled Module JSON Package (M7.5)
 *
 * 版本的 Module 导出/导入格式。导出文件包含 source + module + 元数据，
 * 可在另一台设备/浏览器中导入并立即开始学习，无需重新调用 /api/compile。
 *
 * 安全约束（M7.5 Plan §Global Constraints）：
 *   - 导出文件绝不包含 API Key（parseModulePackage 会拒绝含 "apiKey" 的 JSON）。
 *   - 导入会重新分配 sourceId/moduleId/conceptId.moduleId，避免 id 冲突。
 */

import { nanoid } from 'nanoid'

import type { KnowledgeSource, Module } from '@/types/domain'

import { StorageKeys } from './keys'
import type { StorageRepository } from './repository'

// =================================================================
// 类型
// =================================================================

/**
 * 版本的 Module 导出包。
 *
 * - `version`：语义版本锁定，parseModulePackage 拒绝不支持的版本。
 * - `exportedBy`：标识导出方，防止误读其他工具的 JSON。
 * - `qualityReport`：可选的编译质量摘要（M7.5 Task 6 产出）。
 * - `generatedBy`：可选的生成模型信息（不含 apiKey）。
 */
export interface CompiledModulePackage {
  version: 1
  exportedBy: 'ai-learning-compiler'
  exportedAt: number
  source: KnowledgeSource
  module: Module
  qualityReport?: unknown
  generatedBy?: {
    provider?: string
    model?: string
    generatedAt?: number
  }
}

export type ParsePackageResult =
  { ok: true; pkg: CompiledModulePackage } | { ok: false; error: string }

// =================================================================
// 创建 / 序列化
// =================================================================

/**
 * 组装一个 CompiledModulePackage 实例。
 *
 * 不修改入参；返回新对象。
 */
export function createModulePackage(args: {
  source: KnowledgeSource
  module: Module
  qualityReport?: unknown
  generatedBy?: CompiledModulePackage['generatedBy']
}): CompiledModulePackage {
  return {
    version: 1,
    exportedBy: 'ai-learning-compiler',
    exportedAt: Date.now(),
    source: args.source,
    module: args.module,
    qualityReport: args.qualityReport,
    generatedBy: args.generatedBy,
  }
}

/**
 * 序列化为 pretty JSON 字符（用于 .alc-module.json 文件下载）。
 */
export function serializeModulePackage(pkg: CompiledModulePackage): string {
  return JSON.stringify(pkg, null, 2)
}

// =================================================================
// 解析（带安全校验）
// =================================================================

/**
 * 解析 JSON 字符串为 CompiledModulePackage。
 *
 * 校验顺序：
 *   1. JSON 合法性
 *   2. 顶层是对象
 *   3. version === 1
 *   4. exportedBy === 'ai-learning-compiler'
 *   5. 存在 source 和 module
 *   6. 整体 JSON 文本不含 "apiKey"（防泄漏）
 *
 * 返回 `{ ok: false, error }` 时 error 为中文用户可读文案。
 */
export function parseModulePackage(json: string): ParsePackageResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: '文件不是合法 JSON' }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: '文件内容不是对象' }
  }
  const pkg = parsed as Partial<CompiledModulePackage>
  if (pkg.version !== 1) return { ok: false, error: '不支持的导出版本' }
  if (pkg.exportedBy !== 'ai-learning-compiler') {
    return { ok: false, error: '不是 AI Learning Compiler 导出文件' }
  }
  if (!pkg.source || !pkg.module) return { ok: false, error: '导出文件缺少 source 或 module' }

  // 安全检查：导出文件整体不能含 apiKey 字符串（即使在嵌套对象里）
  if (json.includes('"apiKey"')) {
    return { ok: false, error: '导出文件不能包含 API Key' }
  }

  return { ok: true, pkg: pkg as CompiledModulePackage }
}

// =================================================================
// 导入（写入 repository，重分配 id）
// =================================================================

/**
 * 把 package 写入 repository，返回新 Module。
 *
 * 行为：
 *   - 生成新的 sourceId / moduleId / concept.moduleId / feynman.moduleId
 *   - 不修改入参 pkg（immutability）
 *   - 写入 source、module，以及可选的 qualityReport
 *
 * 不调用 /api/compile；这是节省 LLM 成本的核心验收点。
 */
export function importModulePackage(repo: StorageRepository, pkg: CompiledModulePackage): Module {
  const nextSourceId = `source-${nanoid()}`
  const nextModuleId = `module-${nanoid()}`

  const nextModule: Module = {
    ...pkg.module,
    id: nextModuleId,
    sourceId: nextSourceId,
    importedAt: Date.now(),
    concepts: pkg.module.concepts.map((concept) => ({
      ...concept,
      moduleId: nextModuleId,
    })),
    feynmanTask: {
      ...pkg.module.feynmanTask,
      moduleId: nextModuleId,
    },
  }

  repo.set(StorageKeys.source(nextSourceId), {
    ...pkg.source,
    id: nextSourceId,
    createdAt: Date.now(),
  })
  repo.set(StorageKeys.module(nextModuleId), nextModule)
  if (pkg.qualityReport !== undefined) {
    repo.set(StorageKeys.qualityReport(nextModuleId), pkg.qualityReport)
  }

  return nextModule
}
