'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { localDateString, loadStreak } from '@/lib/runtime/streak'
import { isDue } from '@/lib/runtime/fsrs'
import { findQuizInModule } from '@/lib/runtime/adaptive-sequencer'
import { listStoredModules, loadStoredModule } from '@/lib/persistence/module-library'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import { getStorage } from '@/lib/persistence/client/storage'
import { useSettingsStore } from '@/lib/state/settings-store'
import { useReviewStore, type ReviewQueueItem } from '@/lib/state/review-store'
import { useTodaySessionStore } from '@/lib/state/today-session-store'

interface DueModule {
  moduleId: string
  title: string
  count: number
}

function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = result[index]!
    result[index] = result[swapIndex]!
    result[swapIndex] = current
  }
  return result
}

function collectDueQueue(now: Date, timezone: string): ReviewQueueItem[] {
  const queue: ReviewQueueItem[] = []
  const repository = getStorage()
  const summaries = listStoredModules(repository)

  for (const summary of summaries) {
    const moduleData = loadStoredModule(repository, summary.id)
    if (!moduleData) continue

    const schedules = scheduleLibrary
      .listByModule(moduleData.id, repository)
      .filter((schedule) => isDue(schedule, now, timezone))
    for (const schedule of schedules) {
      const quiz = findQuizInModule(moduleData, schedule.slotId)
      if (!quiz || quiz.ignored) continue
      queue.push({ quiz, moduleId: moduleData.id, slotId: schedule.slotId })
    }
  }
  return queue
}

function groupDueModules(queue: ReviewQueueItem[]): DueModule[] {
  const counts = new Map<string, DueModule>()
  for (const item of queue) {
    const existing = counts.get(item.moduleId)
    if (existing) {
      existing.count += 1
      continue
    }
    const moduleData = loadStoredModule(getStorage(), item.moduleId)
    counts.set(item.moduleId, {
      moduleId: item.moduleId,
      title: moduleData?.title ?? '未命名模块',
      count: 1,
    })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
}

export default function TodayPage() {
  const router = useRouter()
  const hydrated = useHydrated()
  const fsrsEnabled = useSettingsStore((state) => state.fsrs.enabled)
  const todaySession = useTodaySessionStore((state) => state.session)
  const hydrateTodaySession = useTodaySessionStore((state) => state.hydrate)
  const startTodaySession = useReviewStore((state) => state.startTodaySession)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    if (!hydrated) return
    hydrateTodaySession()
    setNow(new Date())
  }, [hydrated, hydrateTodaySession])

  const timezone = browserTimezone()
  const todayLocal = now ? localDateString(now, timezone) : ''
  const activeSession = todaySession?.date === todayLocal ? todaySession : null
  const dueQueue = useMemo(
    () => (now && fsrsEnabled ? collectDueQueue(now, timezone) : []),
    [now, fsrsEnabled, timezone],
  )
  const snapshotQueue = useMemo(() => {
    if (activeSession) return activeSession.queue
    return dueQueue
  }, [activeSession, dueQueue])
  const moduleGroups = useMemo(() => groupDueModules(snapshotQueue), [snapshotQueue])
  const initialCount = activeSession?.initialDueSnapshot.length ?? dueQueue.length
  const completedCount = activeSession?.results.length ?? 0
  const passedCount = activeSession?.results.filter((result) => result.passed).length ?? 0
  const isFinished =
    activeSession !== null && activeSession.currentIndex >= activeSession.queue.length
  const streak = hydrated ? loadStreak(getStorage()) : null

  const handleStart = useCallback(() => {
    if (!todayLocal) return
    if (activeSession) {
      router.push('/learn/today/review')
      return
    }
    if (!fsrsEnabled) return
    const freshQueue = shuffle(collectDueQueue(new Date(), timezone))
    if (freshQueue.length === 0) return
    if (startTodaySession(freshQueue, todayLocal)) {
      router.push('/learn/today/review')
    }
  }, [activeSession, fsrsEnabled, router, startTodaySession, timezone, todayLocal])

  if (!hydrated || !now) return null

  return (
    <main className="alc-page">
      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 space-y-6">
        <header className="space-y-2">
          <p className="alc-label">SPACED REPETITION</p>
          <h1 className="text-2xl font-semibold text-fg-primary">今日复习</h1>
          <p className="text-sm text-fg-secondary">按浏览器本地时区 · {todayLocal}</p>
        </header>

        <section className="grid grid-cols-3 gap-3" aria-label="今日复习概览">
          <div className="alc-card p-4">
            <p className="alc-label">连续打卡</p>
            <p className="mt-2 text-2xl font-semibold text-accent-primary">
              {streak?.currentStreak ?? 0}
            </p>
            <p className="text-xs text-fg-tertiary">天</p>
          </div>
          <div className="alc-card p-4">
            <p className="alc-label">今日到期（FSRS）</p>
            <p className="mt-2 text-2xl font-semibold text-fg-primary">
              {fsrsEnabled ? initialCount : '—'}
            </p>
            <p className="text-xs text-fg-tertiary">
              {fsrsEnabled ? '启动时快照 · 不等于今日总作答' : 'FSRS 未启用，due 不可用'}
            </p>
          </div>
          <div className="alc-card p-4">
            <p className="alc-label">完成进度</p>
            <p className="mt-2 text-2xl font-semibold text-fg-primary">
              {completedCount} / {initialCount}
            </p>
            <p className="text-xs text-fg-tertiary">已完成 / 启动时到期</p>
          </div>
        </section>

        {!fsrsEnabled && (
          <section className="alc-card p-4 space-y-2" role="status">
            <p className="text-sm text-fg-primary">FSRS 尚未启用</p>
            <p className="text-xs text-fg-secondary">
              今日到期队列不可用；基础作答记录和学习日统计仍会保留在学习统计中。
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="alc-button-secondary text-xs px-3 py-1.5"
                onClick={() => router.push('/settings')}
              >
                前往设置
              </button>
              <button
                type="button"
                className="alc-button-secondary text-xs px-3 py-1.5"
                onClick={() => router.push('/learn/stats')}
              >
                查看学习统计
              </button>
            </div>
          </section>
        )}

        {fsrsEnabled && moduleGroups.length > 0 && (
          <section className="space-y-3" aria-label="按模块分组的到期题目">
            <h2 className="text-sm font-medium text-fg-primary">按模块分组</h2>
            <div className="space-y-2">
              {moduleGroups.map((group) => (
                <div
                  key={group.moduleId}
                  className="alc-card px-4 py-3 flex items-center justify-between"
                >
                  <span className="text-sm text-fg-primary">{group.title}</span>
                  <span className="text-xs text-fg-secondary">{group.count} 题</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {fsrsEnabled && moduleGroups.length === 0 && !activeSession && (
          <div className="alc-card p-5 text-sm text-fg-secondary" role="status">
            今天没有已到期的题目。到期数量来自当前 FSRS schedule，不代表今天没有学习记录。
          </div>
        )}

        {activeSession && isFinished && initialCount > 0 && (
          <section className="alc-card p-5 space-y-2" role="status">
            <p className="text-sm text-fg-primary">本轮复习已完成</p>
            <p className="text-2xl font-semibold text-accent-primary">
              {Math.round((passedCount / Math.max(completedCount, 1)) * 100)}%
            </p>
            <p className="text-xs text-fg-secondary">
              正确 {passedCount} / 共 {completedCount} 题
            </p>
          </section>
        )}

        <div className="flex gap-3">
          {(activeSession || fsrsEnabled) &&
            !isFinished &&
            (initialCount > 0 || dueQueue.length > 0) && (
              <button
                type="button"
                className="alc-button-primary text-sm px-4 py-2"
                onClick={handleStart}
              >
                {activeSession ? '继续今日复习' : `开始今日复习 (${dueQueue.length})`}
              </button>
            )}
          <button
            type="button"
            className="alc-button-secondary text-sm px-4 py-2"
            onClick={() => router.push('/learn/library')}
          >
            返回题库
          </button>
        </div>
      </div>
    </main>
  )
}
