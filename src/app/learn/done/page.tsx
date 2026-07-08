'use client'

/**
 * 完成页 — 掌握度报告
 *
 * 对应 docs/M4-M5-Plan.md W7 / FR-07。
 * UI 参考：docs/ui-design/10-done.html
 *
 * 功能：
 *   - Mastery 卡片：moduleCompletion % + 各 concept 掌握度条
 *   - Feynman 得分 + Rubric 命中详情
 *   - "重新学习" / "导入新内容"入口
 */

import { useRouter } from 'next/navigation'
import { useMemo, useEffect } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { computeMastery } from '@/lib/runtime/mastery'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'

export default function DonePage() {
  const router = useRouter()
  const hydrated = useHydrated()
  const currentModule = useModuleStore((s) => s.currentModule)
  const feynmanAttempt = useProgressStore((s) => s.feynmanAttempt)
  const stage = useProgressStore((s) => s.stage)
  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)

  // 未完成时回到首页（等 hydration 完成后再检查）
  useEffect(() => {
    if (hydrated && (!currentModule || stage?.kind !== 'done')) {
      router.replace('/')
    }
  }, [hydrated, currentModule, stage, router])

  const mastery = useMemo(() => {
    if (!currentModule) return null
    return computeMastery(currentModule, attemptsBySlot, feynmanAttempt ?? undefined)
  }, [currentModule, attemptsBySlot, feynmanAttempt])

  if (!currentModule || !mastery) return null

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full border border-neutral-700 flex items-center justify-center">
            <span className="text-neutral-300 text-lg">{'✓'}</span>
          </div>
          <h1 className="text-2xl font-semibold">学习完成</h1>
          <p className="text-sm text-neutral-500">{currentModule.title}</p>
        </div>

        {/* Overall completion */}
        <div className="flex items-center justify-center gap-8 py-6 border-y border-neutral-800">
          <div className="text-center">
            <div className="text-3xl font-light tabular-nums">
              {mastery.moduleCompletion}
              <span className="text-sm text-neutral-600">%</span>
            </div>
            <p className="text-xs text-neutral-600 mt-1">模块完成度</p>
          </div>
          {mastery.feynmanScore !== undefined && (
            <div className="text-center">
              <div className="text-3xl font-light tabular-nums">
                {mastery.feynmanScore}
                <span className="text-sm text-neutral-600">/100</span>
              </div>
              <p className="text-xs text-neutral-600 mt-1">费曼得分</p>
            </div>
          )}
        </div>

        {/* Concept mastery bars */}
        <div className="space-y-4">
          <p className="text-xs text-neutral-600 uppercase tracking-wider">概念掌握度</p>
          <div className="space-y-3">
            {mastery.conceptMastery.map((cm) => {
              const concept = currentModule.concepts.find((c) => c.id === cm.conceptId)
              return (
                <div key={cm.conceptId} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">
                      {concept?.name ?? cm.conceptId}
                    </span>
                    <span className="text-xs text-neutral-500 tabular-nums">{cm.mastery}%</span>
                  </div>
                  <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        cm.mastery >= 80
                          ? 'bg-emerald-500/50'
                          : cm.mastery >= 50
                            ? 'bg-amber-500/50'
                            : 'bg-neutral-600'
                      }`}
                      style={{ width: `${cm.mastery}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={() => router.push('/learn/import')}
            className="flex-1 py-3 rounded-lg bg-neutral-100 text-neutral-900 font-medium text-sm hover:bg-white transition-colors"
          >
            导入新内容
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex-1 py-3 rounded-lg border border-neutral-700 text-neutral-300 font-medium text-sm hover:bg-neutral-900 transition-colors"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  )
}
