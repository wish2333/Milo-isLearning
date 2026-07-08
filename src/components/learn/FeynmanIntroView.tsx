'use client'

/**
 * FeynmanIntroView — 费曼任务导言
 *
 * 对应 docs/M4-M5-Plan.md W6 / FR-06。
 * 显示费曼任务说明 + finalPrompt 预览 + 开始按钮。
 */

import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'

export function FeynmanIntroView() {
  const currentModule = useModuleStore((s) => s.currentModule)
  const startFeynman = useProgressStore((s) => s.startFeynman)

  if (!currentModule) return null

  const { feynmanTask } = currentModule

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-8">
        <div className="space-y-2">
          <p className="text-xs text-neutral-600 uppercase tracking-wider">费曼任务</p>
          <h2 className="text-2xl font-semibold">用你的话讲一遍</h2>
        </div>

        <p className="text-sm text-neutral-400 leading-relaxed">
          你已完成全部概念练习。接下来，通过 6 步引导式费曼练习， 检验你是否真正理解了这些知识。前 5
          步是选择题和填空题， 第 6 步需要你用自己的话写出完整解释。
        </p>

        {/* Rubric preview */}
        <div className="space-y-2">
          <p className="text-xs text-neutral-600 uppercase tracking-wider">评分维度</p>
          <ul className="space-y-1">
            {feynmanTask.rubric.map((point) => (
              <li key={point} className="text-sm text-neutral-400 flex items-start gap-2">
                <span className="text-neutral-600 mt-0.5">-</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Final prompt preview */}
        <div className="border-l-2 border-neutral-700 pl-4 py-1">
          <p className="text-xs text-neutral-600 mb-1">最终任务</p>
          <p className="text-sm text-neutral-300">{feynmanTask.finalPrompt}</p>
        </div>

        <button
          onClick={startFeynman}
          className="w-full py-3 rounded-lg bg-neutral-100 text-neutral-900 font-medium text-sm hover:bg-white transition-colors"
        >
          开始费曼练习
        </button>
      </div>
    </div>
  )
}
