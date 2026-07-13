/**
 * BackupPackage v1 -- 全库原始 JSON 备份格式（评审 3.2.5 定案）
 *
 * 设计要点：
 *   - valueRaw 保留原始 JSON 字符串（不重新序列化，避免字段顺序变化破坏 checksum）
 *   - checksum 用长度前缀编码（避免对象字段顺序问题）
 *   - 安全过滤：settings 按 schema 剔除已知 API key 字段（评审 6.3 D10）
 *
 * v1.0.0 不实现「按 updatedAt 自动 merge」（评审延后到 v1.0.1）。
 */

import { createHash } from 'node:crypto'

import { z } from 'zod'

import { isAlcKey } from './shared/keys'
import { parseNamespace } from './shared/namespace'

// =================================================================
// Schema
// =================================================================

export const BackupEntryV1Schema = z.object({
  key: z.string(),
  valueRaw: z.string(),
  namespace: z.string(),
  updatedAt: z.number(),
})
export type BackupEntryV1 = z.infer<typeof BackupEntryV1Schema>

export const BackupPackageV1Schema = z.object({
  version: z.literal(1),
  exportedBy: z.literal('ai-learning-compiler'),
  exportedAt: z.number(),
  appMode: z.enum(['production', 'showcase']),
  schemaVersion: z.number(),
  entries: z.array(BackupEntryV1Schema),
  meta: z.object({
    moduleCount: z.number(),
    totalBytes: z.number(),
    checksum: z.string(),
    appVersion: z.string(),
  }),
})
export type BackupPackageV1 = z.infer<typeof BackupPackageV1Schema>

// =================================================================
// Checksum（长度前缀编码，评审 D7 定案）
// =================================================================

/**
 * 长度前缀 SHA-256 checksum。
 *
 * 算法：entries 按 key 排序，每条编码为
 *   `${keyLength}:${key}${valueLength}:${valueRaw}${updatedAtLength}:${updatedAt}`
 * 拼接后整体 sha256。
 *
 * 长度前缀避免字段顺序歧义：`a|bc` vs `ab|c` 编码后不同。
 */
export function computeChecksum(entries: BackupEntryV1[]): string {
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key))
  let encoded = ''
  for (const e of sorted) {
    encoded += `${e.key.length}:${e.key}${e.valueRaw.length}:${e.valueRaw}${String(e.updatedAt).length}:${e.updatedAt}`
  }
  return sha256Hex(encoded)
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// =================================================================
// 序列化
// =================================================================

export const APP_VERSION = '1.0.0'

/**
 * 把 [key, valueRaw][] 转成完整 BackupPackageV1（含 checksum）。
 *
 * 调用方：
 *   - export API：从 SQLite dumpAll() 拿到 entries -> 调本函数 -> JSON.stringify 返回
 *   - migration source snapshot：同上
 */
export function buildBackupPackage(args: {
  entries: Array<[string, string]>
  appMode: 'production' | 'showcase'
  schemaVersion: number
  moduleCount: number
}): BackupPackageV1 {
  const { entries, appMode, schemaVersion, moduleCount } = args

  const now = Date.now()
  const totalBytes = entries.reduce((sum, [k, v]) => sum + k.length + v.length, 0)

  const backupEntries: BackupEntryV1[] = entries
    .filter(([key]) => isAlcKey(key))
    .map(([key, valueRaw]) => ({
      key,
      valueRaw,
      namespace: parseNamespace(key),
      updatedAt: now,
    }))

  const checksum = computeChecksum(backupEntries)

  return {
    version: 1,
    exportedBy: 'ai-learning-compiler',
    exportedAt: now,
    appMode,
    schemaVersion,
    entries: backupEntries,
    meta: {
      moduleCount,
      totalBytes,
      checksum,
      appVersion: APP_VERSION,
    },
  }
}

/**
 * 序列化为 JSON 字符串。
 */
export function serializeBackupPackage(pkg: BackupPackageV1): string {
  return JSON.stringify(pkg)
}

/**
 * 解析 JSON 字符串为 BackupPackageV1。
 *
 * 校验：Zod schema + checksum 比对。
 * 失败抛错（不返回 null，由调用方 try-catch）。
 */
export function parseBackupPackage(json: string): BackupPackageV1 {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Backup JSON 解析失败：不是有效的 JSON 字符串')
  }

  const result = BackupPackageV1Schema.safeParse(parsed)
  if (!result.success) {
    throw new Error('Backup 格式不匹配：' + result.error.issues.map((i) => i.message).join('; '))
  }

  // 校验 checksum
  const expectedChecksum = computeChecksum(result.data.entries)
  if (expectedChecksum !== result.data.meta.checksum) {
    throw new Error(
      'Backup checksum 不匹配：数据可能损坏（期望 ' +
        result.data.meta.checksum.slice(0, 8) +
        '，实际 ' +
        expectedChecksum.slice(0, 8) +
        '）',
    )
  }

  return result.data
}

// =================================================================
// 安全过滤（评审 6.3 D10 定案）
// =================================================================

/**
 * 已知敏感字段名（用于 settings 字段级剔除）。
 *
 * 不靠关键词扫描——正文里出现 "token" / "password" 不应该拒绝整份备份。
 */
const SENSITIVE_SETTINGS_KEYS = [
  'apiKey',
  'api_key',
  'DEEPSEEK_API_KEY',
  'GLM_API_KEY',
  'OPENAI_COMPAT_API_KEY',
  'availableKeys',
] as const

/**
 * 安全过滤：对 `alc:settings` entry 剔除已知敏感字段。
 *
 * 其他 key 不动。仅字段级剔除，不拒绝整份备份。
 *
 * 注意：剔除字段后 valueRaw 会变，需要重新计算 entry 的「未来 checksum」吗？
 * 答：不需要——checksum 是在 buildBackupPackage 时基于已过滤的 entries 计算的。
 *     export 时先过滤再 build，导入时收到的是已过滤版本，checksum 仍匹配。
 *     本函数在 buildBackupPackage 调用前应用。
 */
export function sanitizeEntriesForExport(
  entries: Array<[string, string]>,
): Array<[string, string]> {
  return entries.map(([key, valueRaw]) => {
    if (key !== 'alc:settings') return [key, valueRaw] as [string, string]

    try {
      const parsed = JSON.parse(valueRaw) as Record<string, unknown>
      const sanitized = stripSensitiveFields(parsed)
      return [key, JSON.stringify(sanitized)] as [string, string]
    } catch {
      // JSON 解析失败：保留原样（不破坏备份）
      console.warn('[backup-package] alc:settings 解析失败，跳过敏感字段剔除')
      return [key, valueRaw] as [string, string]
    }
  })
}

/**
 * 递归剔除对象中的敏感字段。
 */
function stripSensitiveFields<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map(stripSensitiveFields) as unknown as T
  }
  const obj = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_SETTINGS_KEYS.includes(k as (typeof SENSITIVE_SETTINGS_KEYS)[number])) {
      continue
    }
    result[k] = stripSensitiveFields(v)
  }
  return result as T
}

// =================================================================
// 辅助：模块计数（从 entries 中数 alc:module: 数量）
// =================================================================

export function countModulesInEntries(entries: Array<[string, string]>): number {
  let count = 0
  for (const [key] of entries) {
    if (key.startsWith('alc:module:')) count++
  }
  return count
}
