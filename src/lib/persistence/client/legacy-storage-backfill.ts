import 'client-only'

import {
  filterShowcaseOrigin,
  markMigrated,
  scanLegacyLocalStorage,
} from './legacy-local-storage-scanner'
import { getProductionStorage } from './storage'

/** 将旧版本误写入浏览器 LocalStorage 的 production 数据补入 SQLite。 */
export async function backfillLegacyStorage(): Promise<{ copied: number; skipped: number }> {
  const scan = await scanLegacyLocalStorage()
  const entries = filterShowcaseOrigin(scan.entries, false)
  if (entries.length === 0) return { copied: 0, skipped: 0 }

  const repository = getProductionStorage()
  let copied = 0
  let skipped = 0
  const copiedKeys: string[] = []

  for (const entry of entries) {
    const currentRaw = repository.getRaw(entry.key)
    if (currentRaw !== null) {
      if (entry.key === 'alc:topic-index') {
        const mergedRaw = mergeTopicIndexRaw(currentRaw, entry.valueRaw)
        if (mergedRaw !== currentRaw) {
          repository.setRaw(entry.key, mergedRaw)
          copiedKeys.push(entry.key)
          copied++
        } else {
          skipped++
        }
      } else {
        skipped++
      }
      continue
    }

    repository.setRaw(entry.key, entry.valueRaw)
    copiedKeys.push(entry.key)
    copied++
  }

  if (copied > 0) await repository.flushNow()
  const failedKeys = new Set(repository.getFailedTasks().map((task) => task.key))
  if (copiedKeys.some((key) => failedKeys.has(key))) {
    console.warn('[StorageInitializer] 旧 LocalStorage 回填存在失败写入，保留迁移提示以便重试')
    return { copied, skipped }
  }
  markMigrated()
  return { copied, skipped }
}

function mergeTopicIndexRaw(currentRaw: string, legacyRaw: string): string {
  try {
    const current = JSON.parse(currentRaw) as unknown
    const legacy = JSON.parse(legacyRaw) as unknown
    if (!Array.isArray(current) || !Array.isArray(legacy)) return currentRaw
    const merged = new Map<string, Record<string, unknown>>()
    for (const topic of legacy) {
      if (topic && typeof topic === 'object' && typeof topic.id === 'string') {
        merged.set(topic.id, topic as Record<string, unknown>)
      }
    }
    for (const topic of current) {
      if (topic && typeof topic === 'object' && typeof topic.id === 'string') {
        merged.set(topic.id, topic as Record<string, unknown>)
      }
    }
    return JSON.stringify([...merged.values()])
  } catch {
    return currentRaw
  }
}
