'use client'

import { useEffect, useState } from 'react'

import { isShowcaseMode } from '@/lib/runtime/app-mode'

/**
 * useStorageStats -- 从 /api/data/status 拉取 SQLite 库统计
 *
 * 评审 3.2.7 定案：production 容量统计异步化（不塞进同步的 getStorageCapacitySummary）。
 * Showcase 模式不调用（没有 server）；返回 null。
 *
 * @param refreshIntervalMs - 自动刷新间隔（默认 30 秒；0 = 不自动刷新）
 */

export interface StorageStats {
  enabled: boolean
  schemaVersion: number
  totalEntries: number
  totalBytes: number
}

export interface UseStorageStatsResult {
  stats: StorageStats | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useStorageStats(refreshIntervalMs = 30000): UseStorageStatsResult {
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    // showcase 模式：无 server 端，立即返回 null
    if (isShowcaseMode) {
      setLoading(false)
      setStats(null)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch('/api/data/status')
      .then(async (res) => {
        if (!res.ok) {
          // 404 = production 模式但 server 端 ALC_STORAGE_BACKEND 未启用
          if (res.status === 404) {
            await res.json() // consume body
            if (!cancelled) {
              setStats({
                enabled: false,
                schemaVersion: 0,
                totalEntries: 0,
                totalBytes: 0,
              })
              setError(null)
            }
            return
          }
          throw new Error(`HTTP ${res.status}`)
        }
        const body = (await res.json()) as StorageStats
        if (!cancelled) {
          setStats(body)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // 自动刷新
  useEffect(() => {
    if (isShowcaseMode || refreshIntervalMs <= 0) return
    const timer = setInterval(() => {
      setRefreshKey((k) => k + 1)
    }, refreshIntervalMs)
    return () => clearInterval(timer)
  }, [refreshIntervalMs])

  return {
    stats,
    loading,
    error,
    refresh: () => setRefreshKey((k) => k + 1),
  }
}

/** 测试用：解析 /api/data/status 响应体。 */
export function _parseStatusResponseForTests(body: unknown): StorageStats {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Invalid status response')
  }
  const obj = body as Partial<StorageStats>
  return {
    enabled: Boolean(obj.enabled),
    schemaVersion: obj.schemaVersion ?? 0,
    totalEntries: obj.totalEntries ?? 0,
    totalBytes: obj.totalBytes ?? 0,
  }
}
