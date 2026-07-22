import 'client-only'

import { isAlcKey } from '../shared/keys'
import { parseNamespace } from '../shared/namespace'

/**
 * Legacy LocalStorage Scanner（评审 §3.3 约束红线 #5 例外）
 *
 * 这是 v1.0.0 唯一允许裸用 localStorage 的模块（只读）。
 * 用途：production 模式首次启动时，扫描旧 LS 中的 alc:* 数据用于迁移。
 *
 * 评审 §5 Phase 5 P5.1 + §3.2.4 定案：
 *   - 静态 key 精确匹配（不能用 startsWith）
 *   - 动态 key 前缀匹配
 *   - 排除：alc:runtime-mode（sessionStorage）
 *   - 生成 sourceFingerprint = sha256(sorted keys + values)
 *
 * fingerprint 使用 Web Crypto API（浏览器原生 crypto.subtle），
 * 因此 scanLegacyLocalStorage 是 async 函数。
 */

const STATIC_KEYS = new Set(['alc:settings', 'alc:events', 'alc:ratings', 'alc:topic-index'])

const MIGRATABLE_PREFIXES = [
  'alc:source:',
  'alc:module:',
  'alc:mastery:',
  'alc:feynman:',
  'alc:progress:',
  'alc:attempts-module:',
  'alc:quality:',
]

const GLOBAL_STATE_ATTEMPTS_KEY = 'alc:state:attempts'
const GLOBAL_STATE_PROGRESS_KEY = 'alc:state:progress'

export interface ScannedEntry {
  key: string
  valueRaw: string
  namespace: string
}

export interface ScanResult {
  entries: ScannedEntry[]
  sourceFingerprint: string
  moduleIds: string[]
  dismissedAt: number | null
}

export const MIGRATED_AT_KEY = 'alc:migrated-at'
export const DISMISSED_AT_KEY = 'alc:migration-dismissed-at'

/**
 * 收集 LS 中的 entries（同步部分）。
 *
 * 分离为独立函数以便单测直接验证，不需要 mock crypto.subtle。
 */
export function collectLegacyEntries(): {
  entries: ScannedEntry[]
  moduleIds: string[]
  dismissedAt: number | null
} {
  const entries: ScannedEntry[] = []
  const moduleIds = new Set<string>()

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !isAlcKey(key)) continue
    if (key === 'alc:runtime-mode') continue
    if (key === MIGRATED_AT_KEY || key === DISMISSED_AT_KEY) continue

    const isStatic = STATIC_KEYS.has(key)
    const isPrefix = MIGRATABLE_PREFIXES.some((p) => key.startsWith(p))
    if (!isStatic && !isPrefix) continue

    const value = localStorage.getItem(key)
    if (value === null) continue

    entries.push({
      key,
      valueRaw: value,
      namespace: parseNamespace(key),
    })

    if (key.startsWith('alc:module:')) {
      moduleIds.add(key.slice('alc:module:'.length))
    }
  }

  // 处理 alc:state:attempts（全局表，整条搬运）
  const attemptsValue = localStorage.getItem(GLOBAL_STATE_ATTEMPTS_KEY)
  if (attemptsValue !== null) {
    entries.push({
      key: GLOBAL_STATE_ATTEMPTS_KEY,
      valueRaw: attemptsValue,
      namespace: 'state',
    })
  }

  // 兼容旧版 Zustand progress persist 快照，供模块进度回填使用。
  const progressValue = localStorage.getItem(GLOBAL_STATE_PROGRESS_KEY)
  if (progressValue !== null) {
    entries.push({
      key: GLOBAL_STATE_PROGRESS_KEY,
      valueRaw: progressValue,
      namespace: 'state',
    })
  }

  const dismissedAtStr = localStorage.getItem(DISMISSED_AT_KEY)
  const dismissedAt = dismissedAtStr ? parseInt(dismissedAtStr, 10) : null

  return {
    entries,
    moduleIds: Array.from(moduleIds).sort(),
    dismissedAt,
  }
}

/**
 * 计算 sourceFingerprint：按 key 排序，长度前缀 sha256。
 *
 * 使用 Web Crypto API（浏览器原生 crypto.subtle）。
 */
export async function computeFingerprintAsync(entries: ScannedEntry[]): Promise<string> {
  if (entries.length === 0) return ''
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key))
  let encoded = ''
  for (const e of sorted) {
    encoded += `${e.key.length}:${e.key}${e.valueRaw.length}:${e.valueRaw}`
  }
  const data = new TextEncoder().encode(encoded)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 扫描旧 LS 中的 alc:* 数据。
 *
 * @returns ScanResult（即使 entries 为空也返回，sourceFingerprint 为空字符串）
 *
 * 注意：因为 fingerprint 使用 crypto.subtle（async），本函数是 async 的。
 * UI 组件在 mount 后调用并 await。
 */
export async function scanLegacyLocalStorage(): Promise<ScanResult> {
  const { entries, moduleIds, dismissedAt } = collectLegacyEntries()
  const sourceFingerprint = await computeFingerprintAsync(entries)
  return { entries, sourceFingerprint, moduleIds, dismissedAt }
}

/**
 * 读 client marker：是否已迁移过。
 */
export function isMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_AT_KEY) !== null
  } catch {
    return false
  }
}

/**
 * 写 client marker（迁移成功后调用）。
 */
export function markMigrated(): void {
  try {
    localStorage.setItem(MIGRATED_AT_KEY, String(Date.now()))
    localStorage.removeItem(DISMISSED_AT_KEY)
  } catch {
    // 静默
  }
}

/**
 * 记录 dismissed-at（用户点「稍后」时）。
 */
export function markDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
  } catch {
    // 静默
  }
}

/**
 * 是否应该显示迁移提示（7 天内未 dismiss）。
 */
export function shouldShowMigrationPrompt(scan: ScanResult): boolean {
  if (scan.entries.length === 0) return false
  if (scan.dismissedAt === null) return true
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
  return Date.now() - scan.dismissedAt > SEVEN_DAYS_MS
}

/**
 * 过滤掉 showcase origin 的 Module（默认排除）。
 *
 * 用户在 MigrationDetail 可勾选「包含示例 Module」覆盖此过滤。
 * 按 moduleId 关联过滤：关联数据完整性（全迁或全跳过）。
 */
export function filterShowcaseOrigin(
  entries: ScannedEntry[],
  includeShowcase: boolean,
): ScannedEntry[] {
  if (includeShowcase) return entries

  // 找出所有 showcase origin 的 moduleId
  const showcaseModuleIds = new Set<string>()
  for (const e of entries) {
    if (!e.key.startsWith('alc:module:')) continue
    try {
      const mod = JSON.parse(e.valueRaw) as { origin?: string }
      if (mod.origin === 'showcase') {
        showcaseModuleIds.add(e.key.slice('alc:module:'.length))
      }
    } catch {
      // 跳过损坏条目
    }
  }

  if (showcaseModuleIds.size === 0) return entries

  // 按 moduleId 关联过滤
  return entries.filter((e) => {
    // alc:module:{id}
    if (e.key.startsWith('alc:module:')) {
      const id = e.key.slice('alc:module:'.length)
      return !showcaseModuleIds.has(id)
    }
    // alc:mastery:{id}, alc:feynman:{id}, alc:progress:{id},
    // alc:attempts-module:{id}, alc:quality:{id}
    for (const prefix of [
      'alc:mastery:',
      'alc:feynman:',
      'alc:progress:',
      'alc:attempts-module:',
      'alc:quality:',
    ]) {
      if (e.key.startsWith(prefix)) {
        const id = e.key.slice(prefix.length)
        return !showcaseModuleIds.has(id)
      }
    }
    // alc:source: 保留（不影响数据正确性，可能有冗余）
    // alc:state:attempts 全局表、alc:settings 等静态 key 不动
    return true
  })
}
