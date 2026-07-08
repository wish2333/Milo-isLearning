'use client'

/**
 * 完成页 — 掌握度报告 + 正式完成闭环
 *
 * 对应 docs/M6-Plan.md W4 / FR-07 / US-21/22 / PRD §9.2。
 * UI 参考：docs/ui-design/10-done.html
 *
 * 功能：
 *   - Mastery 卡片：moduleCompletion % + Challenge 得分 + 各 concept 掌握度条
 *   - Feynman 得分 + Rubric 命中详情
 *   - 被跳过 / 待复习概念入口（conceptMastery < 50%）
 *   - 历史 Module 列表
 *   - 清空进度入口（确认对话框）
 *   - "导入新内容" / "返回首页"入口
 */

import { useRouter } from 'next/navigation'
import { useMemo, useEffect, useState } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { computeMastery } from '@/lib/runtime/mastery'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { storage } from '@/lib/persistence/local-storage'

/** conceptMastery 低于此阈值的概念被视为"待复习" */
const REVIEW_THRESHOLD = 50

export default function DonePage() {
  const router = useRouter()
  const hydrated = useHydrated()
  const currentModule = useModuleStore((s) => s.currentModule)
  const clearModule = useModuleStore((s) => s.clear)
  const feynmanAttempt = useProgressStore((s) => s.feynmanAttempt)
  const stage = useProgressStore((s) => s.stage)
  const setStage = useProgressStore((s) => s.setStage)
  const resetProgress = useProgressStore((s) => s.reset)
  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)
  const clearAttempts = useAttemptsStore((s) => s.clearAll)

  const [showClearConfirm, setShowClearConfirm] = useState(false)

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

  // 待复习概念（conceptMastery < REVIEW_THRESHOLD）
  const conceptsToReview = useMemo(() => {
    if (!currentModule || !mastery) return []
    return mastery.conceptMastery
      .filter((cm) => cm.mastery < REVIEW_THRESHOLD)
      .map((cm) => {
        const conceptIndex = currentModule.concepts.findIndex((c) => c.id === cm.conceptId)
        const concept = currentModule.concepts[conceptIndex]
        return { ...cm, conceptIndex, conceptName: concept?.name ?? cm.conceptId }
      })
      .filter((item) => item.conceptIndex >= 0)
  }, [currentModule, mastery])

  const handleReviewConcept = (conceptIndex: number) => {
    if (!currentModule) return
    setStage({ kind: 'concept', conceptIndex, quizIndex: 0 })
    router.push(`/learn/module/${currentModule.id}`)
  }

  const handleClearAll = () => {
    storage.clearAll()
    clearModule()
    resetProgress()
    clearAttempts()
    router.push('/')
  }

  if (!currentModule || !mastery) return null

  return (
    <div className="min-h-screen bg-bg-base text-fg-primary">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <p className="text-xs text-fg-tertiary uppercase tracking-wider">学习完成</p>
          <h1 className="text-2xl font-semibold">{currentModule.title}</h1>
          <p className="text-sm text-fg-tertiary">从选择题走到完整解释</p>
        </div>

        {/* Overall completion + Challenge + Feynman scores */}
        <div className="flex items-center justify-center gap-8 py-6 border-y border-border-default">
          <div className="text-center">
            <div className="text-3xl font-light tabular-nums">
              {mastery.moduleCompletion}
              <span className="text-sm text-fg-tertiary">%</span>
            </div>
            <p className="text-xs text-fg-tertiary mt-1">模块完成度</p>
          </div>
          {mastery.challengeMastery !== undefined && (
            <div className="text-center">
              <div className="text-3xl font-light tabular-nums text-amber-400/80">
                {mastery.challengeMastery}
                <span className="text-sm text-fg-tertiary">%</span>
              </div>
              <p className="text-xs text-fg-tertiary mt-1">挑战得分</p>
            </div>
          )}
          {mastery.feynmanScore !== undefined && (
            <div className="text-center">
              <div className="text-3xl font-light tabular-nums">
                {mastery.feynmanScore}
                <span className="text-sm text-fg-tertiary">/100</span>
              </div>
              <p className="text-xs text-fg-tertiary mt-1">费曼得分</p>
            </div>
          )}
        </div>

        {/* Concept mastery bars */}
        <div className="space-y-4">
          <p className="text-xs text-fg-tertiary uppercase tracking-wider">概念掌握度</p>
          <div className="space-y-3">
            {mastery.conceptMastery.map((cm) => {
              const concept = currentModule.concepts.find((c) => c.id === cm.conceptId)
              return (
                <div key={cm.conceptId} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-fg-secondary">
                      {concept?.name ?? cm.conceptId}
                    </span>
                    <span className="text-xs text-fg-tertiary tabular-nums">{cm.mastery}%</span>
                  </div>
                  <div className="h-1 bg-bg-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        cm.mastery >= 80
                          ? 'bg-emerald-500/50'
                          : cm.mastery >= 50
                            ? 'bg-amber-500/50'
                            : 'bg-state-locked'
                      }`}
                      style={{ width: `${cm.mastery}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Concepts to review */}
        {conceptsToReview.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-fg-tertiary uppercase tracking-wider">待复习概念</p>
            <div className="space-y-2">
              {conceptsToReview.map((item) => (
                <div
                  key={item.conceptId}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border-default bg-bg-surface/30"
                >
                  <div className="flex-1">
                    <p className="text-sm text-fg-secondary">{item.conceptName}</p>
                    <p className="text-xs text-fg-tertiary mt-0.5">掌握度 {item.mastery}%</p>
                  </div>
                  <button
                    onClick={() => handleReviewConcept(item.conceptIndex)}
                    className="px-3 py-1.5 rounded-md border border-border-strong text-fg-secondary text-xs hover:bg-bg-elevated transition-colors whitespace-nowrap"
                  >
                    重新练习
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History modules → Library entry */}
        <div className="space-y-3">
          <p className="text-xs text-fg-tertiary uppercase tracking-wider">题库</p>
          <button
            onClick={() => router.push('/learn/library')}
            className="w-full px-4 py-3 rounded-lg border border-border-subtle bg-bg-surface/20 text-sm text-fg-secondary hover:bg-bg-elevated hover:border-border-strong transition-colors text-left flex items-center justify-between"
          >
            <span>查看全部已保存的 Module</span>
            <span className="text-fg-tertiary">→</span>
          </button>
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-4">
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/learn/import')}
              className="flex-1 py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm hover:bg-accent-primary-hover transition-colors"
            >
              导入新内容
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-3 rounded-lg border border-border-strong text-fg-secondary font-medium text-sm hover:bg-bg-elevated transition-colors"
            >
              返回首页
            </button>
          </div>
          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full py-2 text-xs text-fg-tertiary hover:text-danger transition-colors"
          >
            清空全部数据
          </button>
        </div>

        {/* Clear confirmation dialog */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="max-w-sm w-full mx-4 p-6 rounded-xl bg-bg-surface border border-border-default space-y-4">
              <h3 className="text-base font-medium text-fg-primary">确认清空全部数据？</h3>
              <p className="text-sm text-fg-secondary">
                此操作将删除所有历史 Module、学习进度和作答记录，无法恢复。
              </p>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleClearAll}
                  className="flex-1 py-2.5 rounded-lg bg-red-500/90 text-white text-sm font-medium hover:bg-red-500 transition-colors"
                >
                  确认清空
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-2.5 rounded-lg border border-border-strong text-fg-secondary text-sm hover:bg-bg-elevated transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
