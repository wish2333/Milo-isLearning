'use client'

import React, { useEffect, useMemo, useState } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { getStorage } from '@/lib/persistence/client/storage'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { loadStreak } from '@/lib/runtime/streak'
import { computeStats, type StatsSummary, type StatsTrendDay } from '@/lib/runtime/stats-compute'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { useSettingsStore } from '@/lib/state/settings-store'
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

type TrendRange = '7' | '30'

function formatDate(date: string, range: TrendRange): string {
  const parts = date.split('-')
  if (parts.length !== 3) return date
  const month = parts[1] ?? ''
  const day = parts[2] ?? ''
  if (range === '7') return `${month}/${day}`
  return day
}

function formatRate(value: number, denominator: number): string {
  return denominator > 0 ? `${Math.round(value)}%` : '—'
}

function TrendChart({
  days,
  range,
  fsrsEnabled,
}: {
  days: StatsTrendDay[]
  range: TrendRange
  fsrsEnabled: boolean
}) {
  const maxAttempts = Math.max(...days.map((day) => day.attemptCount), 1)

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5 h-36" aria-label={`${range}日作答趋势`}>
        {days.map((day, index) => {
          const height =
            day.attemptCount === 0
              ? 4
              : Math.max(10, Math.round((day.attemptCount / maxAttempts) * 100))
          const showLabel =
            range === '7' || index === 0 || index === days.length - 1 || index % 5 === 0
          const description = [
            day.date,
            `作答 ${day.attemptCount} 次`,
            `新题 ${day.newAttemptCount} 次`,
            `复习作答 ${day.reviewAttemptCount} 次`,
            `首答正确率 ${formatRate(day.firstCorrectRate, day.firstAttemptCount)}`,
            fsrsEnabled
              ? `到期 ${day.dueCount} 题，完成 ${day.dueCompletedCount} 题`
              : 'FSRS 到期数据不可用',
          ].join('，')

          return (
            <div key={day.date} className="flex-1 min-w-0 h-full flex flex-col justify-end gap-1">
              <div className="relative flex-1 flex items-end justify-center group">
                <div
                  className="w-full max-w-5 rounded-t-sm bg-accent-primary-soft border border-accent-primary/40 transition-[height]"
                  style={{ height: `${height}%` }}
                  role="img"
                  aria-label={description}
                  title={description}
                />
              </div>
              <span className="h-4 text-center text-[10px] text-fg-tertiary">
                {showLabel ? formatDate(day.date, range) : ''}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-fg-tertiary">
        柱高代表当日已保存作答次数；新题 = 各题槽位首答，复习作答 = 后续重试/复习作答。
      </p>
    </div>
  )
}

function SnapshotTime(now: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(now)
}

export default function StatsPage() {
  const hydrated = useHydrated()
  const attemptsBySlot = useAttemptsStore((state) => state.attemptsBySlot)
  const fsrsEnabled = useSettingsStore((state) => state.fsrs.enabled)
  const [statsNow, setStatsNow] = useState<Date | null>(null)
  const [range, setRange] = useState<TrendRange>('7')

  useEffect(() => {
    if (hydrated && !statsNow) setStatsNow(new Date())
  }, [hydrated, statsNow])

  const stats = useMemo<StatsSummary | null>(() => {
    if (!hydrated || !statsNow) return null
    const repository = getStorage()
    return computeStats({
      modules: loadVisibleModules(),
      attemptsBySlot,
      schedules: scheduleLibrary.listAll(repository),
      streak: loadStreak(repository),
      now: statsNow,
    })
  }, [attemptsBySlot, hydrated, statsNow])

  if (!stats) return null

  const selectedTrend = range === '7' ? stats.sevenDayTrend : stats.thirtyDayTrend
  const selectedStudyDays = range === '7' ? stats.sevenDayStudyDays : stats.thirtyDayStudyDays
  const selectedAttempts = selectedTrend.reduce((sum, day) => sum + day.attemptCount, 0)
  const selectedCorrect = selectedTrend.reduce((sum, day) => sum + day.correctCount, 0)
  const selectedFirstAttempts = selectedTrend.reduce((sum, day) => sum + day.firstAttemptCount, 0)
  const selectedFirstCorrect = selectedTrend.reduce((sum, day) => sum + day.firstCorrectCount, 0)
  const selectedNewAttempts = selectedTrend.reduce((sum, day) => sum + day.newAttemptCount, 0)
  const selectedReviewAttempts = selectedTrend.reduce((sum, day) => sum + day.reviewAttemptCount, 0)
  const selectedAccuracy = selectedAttempts > 0 ? (selectedCorrect / selectedAttempts) * 100 : 0
  const selectedFirstAccuracy =
    selectedFirstAttempts > 0 ? (selectedFirstCorrect / selectedFirstAttempts) * 100 : 0
  const today = selectedTrend.at(-1)
  const dueCompletion =
    stats.todayDueCount > 0
      ? Math.round((stats.todayCompletedCount / stats.todayDueCount) * 100)
      : 0

  return (
    <main className="alc-page">
      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
        <header className="space-y-2">
          <p className="alc-label">学习反馈</p>
          <h1 className="text-2xl font-medium text-fg-primary">学习统计</h1>
          <p className="text-sm text-fg-secondary">
            用已保存的作答记录回看学习节奏；数据按浏览器本地时区统计。
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard
            label="今日学习"
            value={`${today?.attemptCount ?? 0} 次`}
            detail={`${today?.newAttemptCount ?? 0} 次新题首答 · ${today?.reviewAttemptCount ?? 0} 次复习作答`}
          />
          {fsrsEnabled ? (
            <MetricCard
              label="今日复习（FSRS）"
              value={`${stats.todayCompletedCount} / ${stats.todayDueCount}`}
              detail="已完成 / 当前到期，不等于今日总作答"
              progress={stats.todayDueCount > 0 ? dueCompletion : undefined}
            />
          ) : (
            <MetricCard
              label="今日复习（FSRS）"
              value="不可用"
              detail="FSRS 未启用；作答与学习日统计仍可用"
            />
          )}
          <MetricCard
            label="连续学习"
            value={`${stats.currentStreak} 天`}
            detail={`最长连续 ${stats.longestStreak} 天`}
          />
          <MetricCard
            label={`近 ${range} 日正确率`}
            value={formatRate(selectedAccuracy, selectedAttempts)}
            detail={`${selectedCorrect} / ${selectedAttempts} 次答题正确`}
            progress={selectedAttempts > 0 ? selectedAccuracy : undefined}
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

        <section className="alc-card p-5 space-y-5" aria-labelledby="stats-trend-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="alc-label">作答趋势</p>
              <h2 id="stats-trend-heading" className="text-lg font-medium text-fg-primary">
                最近 {range} 日
              </h2>
            </div>
            <div className="flex gap-1 rounded-md bg-bg-elevated p-1" aria-label="趋势时间范围">
              {(['7', '30'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`px-3 py-1.5 text-xs rounded ${range === option ? 'bg-accent-primary text-bg-base' : 'text-fg-secondary'}`}
                  aria-pressed={range === option}
                  onClick={() => setRange(option)}
                >
                  {option} 日
                </button>
              ))}
            </div>
          </div>

          <TrendChart days={selectedTrend} range={range} fsrsEnabled={fsrsEnabled} />

          <div className="grid gap-3 sm:grid-cols-4" aria-label={`${range}日学习摘要`}>
            <div>
              <p className="alc-label">学习日</p>
              <p className="mt-1 text-xl text-fg-primary">{selectedStudyDays} 天</p>
            </div>
            <div>
              <p className="alc-label">作答正确率</p>
              <p className="mt-1 text-xl text-fg-primary">
                {formatRate(selectedAccuracy, selectedAttempts)}
              </p>
            </div>
            <div>
              <p className="alc-label">首答正确率</p>
              <p className="mt-1 text-xl text-fg-primary">
                {formatRate(selectedFirstAccuracy, selectedFirstAttempts)}
              </p>
            </div>
            <div>
              <p className="alc-label">新题 / 复习作答</p>
              <p className="mt-1 text-xl text-fg-primary">
                {selectedNewAttempts} / {selectedReviewAttempts}
              </p>
            </div>
          </div>

          {selectedAttempts === 0 && (
            <div
              className="rounded-md border border-border-default bg-bg-elevated p-4 text-sm text-fg-secondary"
              role="status"
            >
              还没有可展示的作答记录。完成一道题后，这里会按本地日期生成趋势。
            </div>
          )}

          <p className="text-xs text-fg-tertiary">
            统计快照：{SnapshotTime(statsNow!)} · 来源：当前模式可见 Module、已保存 attempts；
            {fsrsEnabled
              ? 'FSRS due 来自当前 schedule 派生缓存。'
              : 'FSRS 未启用，due 指标不参与本页统计。'}
          </p>
        </section>
      </div>
    </main>
  )
}
