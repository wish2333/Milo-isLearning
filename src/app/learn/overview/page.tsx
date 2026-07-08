'use client'

/**
 * 课程概览页
 *
 * 对应 docs/M4-M5-Plan.md W3 / US-05。
 * UI 参考：docs/ui-design/03-overview.html
 *
 * 功能：
 *   - Module 标题 + intro + goal
 *   - Concept 列表（名称 + 类型 + 预计题数）
 *   - 预计学习时长
 *   - "开始学习" → progress-store 初始化 → 路由到 module 页
 */

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'

export default function OverviewPage() {
  const router = useRouter()
  const hydrated = useHydrated()
  const currentModule = useModuleStore((s) => s.currentModule)
  const startModule = useProgressStore((s) => s.startModule)
  const stage = useProgressStore((s) => s.stage)
  const [savedConfirmation, setSavedConfirmation] = useState(false)

  // 无 Module 数据时回到导入页（等 hydration 完成后再检查）
  useEffect(() => {
    if (hydrated && !currentModule) {
      router.replace('/learn/import')
    }
  }, [hydrated, currentModule, router])

  useEffect(() => {
    if (!hydrated) return
    if (sessionStorage.getItem('alc:module-saved-confirmation') === '1') {
      setSavedConfirmation(true)
      sessionStorage.removeItem('alc:module-saved-confirmation')
    }
  }, [hydrated])

  if (!currentModule) return null

  // 计算预计学习时长
  const totalConceptQuizzes = currentModule.concepts.reduce(
    (sum, c) => sum + c.quizSeries.quizzes.length,
    0,
  )
  const totalFeynmanSteps = 6
  const totalItems = totalConceptQuizzes + totalFeynmanSteps
  const estimatedMinutes = Math.ceil((totalItems * 15 + 120) / 60) // 每 Quiz 15s + Feynman 120s

  const handleStart = () => {
    // 若已有进度（刷新恢复），直接继续；否则初始化
    if (!stage || stage.kind === 'done') {
      startModule(currentModule.id)
    }
    router.push(`/learn/module/${currentModule.id}`)
  }

  // 已有进度时显示"继续学习"
  const hasProgress = stage && stage.kind !== 'module_intro' && stage.kind !== 'done'
  const buttonText = hasProgress ? '继续学习' : '开始学习'

  return (
    <main className="min-h-screen bg-bg-base text-fg-primary">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">
        {/* Top bar: lightweight library entry */}
        <div className="flex justify-end">
          <button
            onClick={() => router.push('/learn/library')}
            className="text-xs text-fg-tertiary hover:text-fg-secondary transition-colors"
          >
            ← 返回题库
          </button>
        </div>

        {/* Header */}
        <div className="space-y-3">
          {savedConfirmation && (
            <div className="rounded-lg border border-border-default bg-bg-surface/50 px-4 py-3 text-sm text-fg-secondary">
              已保存到题库。旧题库仍可在“我的题库”中打开。
            </div>
          )}
          <p className="text-xs text-fg-tertiary uppercase tracking-wider">学习模块</p>
          <h1 className="text-3xl font-semibold text-fg-primary">{currentModule.title}</h1>
          <p className="text-sm text-fg-secondary leading-relaxed">{currentModule.intro}</p>
        </div>

        {/* Goal */}
        <div className="border-l-2 border-border-strong pl-4 py-1">
          <p className="text-xs text-fg-tertiary mb-1">学习目标</p>
          <p className="text-sm text-fg-secondary">{currentModule.goal}</p>
        </div>

        {/* Stats */}
        <div className="flex gap-6">
          <div className="space-y-0.5">
            <p className="text-xs text-fg-tertiary">概念数</p>
            <p className="text-lg text-fg-primary">{currentModule.concepts.length}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-fg-tertiary">练习数</p>
            <p className="text-lg text-fg-primary">{totalConceptQuizzes}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-fg-tertiary">费曼步骤</p>
            <p className="text-lg text-fg-primary">{totalFeynmanSteps} 步</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-fg-tertiary">预计时长</p>
            <p className="text-lg text-fg-primary">约 {estimatedMinutes} 分钟</p>
          </div>
        </div>

        {/* Concept List */}
        <div className="space-y-3">
          <p className="text-xs text-fg-tertiary uppercase tracking-wider">概念清单</p>
          <div className="space-y-2">
            {currentModule.concepts.map((concept, i) => (
              <div
                key={concept.id}
                className="flex items-center justify-between py-3 px-4 border border-border-default rounded-lg hover:border-border-strong transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-fg-tertiary tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="text-sm text-fg-primary">{concept.name}</p>
                    <p className="text-xs text-fg-tertiary">{concept.type}</p>
                  </div>
                </div>
                <span className="text-xs text-fg-tertiary">
                  {concept.quizSeries.quizzes.length} 题
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleStart}
          className="w-full py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm hover:bg-accent-primary-hover transition-colors"
        >
          {buttonText}
        </button>
      </div>
    </main>
  )
}
