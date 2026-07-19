'use client'

import { useMemo } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { getStorage } from '@/lib/persistence/client/storage'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { loadStreak } from '@/lib/runtime/streak'
import { computeStats, type StatsSummary } from '@/lib/runtime/stats-compute'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import type { Module } from '@/types/domain'

function loadVisibleModules(): Module[] {
  const repository = getStorage()
  const modulePrefix = StorageKeys.module('').slice(0, -1)
  return repository
    .keys()
    .filter((key) => key.startsWith(modulePrefix))
    .map((key) => repository.get<Module>(key))
    .filter((module): module is Module => module !== null)
    .filter((module) =>
      isShowcaseMode ? module.origin === 'showcase' : module.origin !== 'showcase',
    )
}

function ProgressBar({ value }: { value: number }) {
  const percent = Math.min(100, Math.max(0, value))
  return (
    <div
      className="h-2 rounded-full bg-bg-elevated"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-accent-primary transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  progress,
}: {
  label: string
  value: string
  detail?: string
  progress?: number
}) {
  return (
    <section className="alc-card p-5 space-y-3">
      <p className="alc-label">{label}</p>
      <p className="text-3xl font-medium text-fg-primary">{value}</p>
      {detail && <p className="text-xs text-fg-secondary">{detail}</p>}
      {progress !== undefined && <ProgressBar value={progress} />}
    </section>
  )
}

export default function StatsPage() {
  const hydrated = useHydrated()
  const attemptsBySlot = useAttemptsStore((state) => state.attemptsBySlot)

  const stats = useMemo<StatsSummary | null>(() => {
    if (!hydrated) return null
    const repository = getStorage()
    return computeStats({
      modules: loadVisibleModules(),
      attemptsBySlot,
      schedules: scheduleLibrary.listAll(repository),
      streak: loadStreak(repository),
    })
  }, [attemptsBySlot, hydrated])

  if (!stats) return null

  const completion =
    stats.todayDueCount === 0 ? 0 : (stats.todayCompletedCount / stats.todayDueCount) * 100

  return (
    <main className="alc-page">
      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
        <header className="space-y-2">
          <p className="alc-label">学习反馈</p>
          <h1 className="text-2xl font-medium text-fg-primary">学习统计</h1>
          <p className="text-sm text-fg-secondary">用几个数字回看最近的学习节奏。</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard
            label="今日复习"
            value={`${stats.todayCompletedCount} / ${stats.todayDueCount}`}
            detail="已完成 / 今日到期"
            progress={completion}
          />
          <MetricCard
            label="连续学习"
            value={`${stats.currentStreak} 天`}
            detail={`最长连续 ${stats.longestStreak} 天`}
          />
          <MetricCard
            label="近 7 日正确率"
            value={`${stats.sevenDayAccuracy}%`}
            detail={`${stats.sevenDayCorrect} / ${stats.sevenDayAttempts} 次答题正确`}
            progress={stats.sevenDayAccuracy}
          />
          <MetricCard
            label="题库模块"
            value={`${stats.moduleCount} 个`}
            detail="当前模式下可见的模块"
          />
          <MetricCard
            label="总答题"
            value={`${stats.totalAttempts} 次`}
            detail="已保存的作答记录"
          />
        </div>
      </div>
    </main>
  )
}
