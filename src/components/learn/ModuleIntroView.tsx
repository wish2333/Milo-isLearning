'use client'

/**
 * ModuleIntroView — Module 导言视图
 *
 * 对应 docs/M4-M5-Plan.md W3。
 * 显示 Module title/intro/goal + "开始"按钮。
 */

import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'

export function ModuleIntroView() {
  const currentModule = useModuleStore((s) => s.currentModule)
  const advance = useProgressStore((s) => s.advance)

  if (!currentModule) return null

  const handleStart = () => {
    advance() // module_intro → concept(0, 0)
  }

  return (
    <div className="text-fg-primary">
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-8">
        <div className="space-y-2">
          <p className="text-xs text-fg-quaternary uppercase tracking-wider">导言</p>
          <h1 className="text-3xl font-semibold">{currentModule.title}</h1>
        </div>

        <p className="text-base text-fg-secondary leading-relaxed">{currentModule.intro}</p>

        <div className="border-l-2 border-border-strong pl-4">
          <p className="text-xs text-fg-quaternary mb-1">学习目标</p>
          <p className="text-sm text-fg-secondary">{currentModule.goal}</p>
        </div>

        {/* Concept preview */}
        <div className="space-y-2">
          <p className="text-xs text-fg-quaternary uppercase tracking-wider">
            将学习 {currentModule.concepts.length} 个概念
          </p>
          <div className="space-y-1">
            {currentModule.concepts.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-fg-quaternary tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-fg-secondary">{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleStart}
          className="w-full py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm hover:bg-accent-primary-hover transition-colors"
        >
          开始学习
        </button>
      </div>
    </div>
  )
}
