'use client'

/**
 * Module 学习页 — 状态机路由器
 *
 * 对应 docs/M4-M5-Plan.md W3 / Tech Spec §5.1。
 *
 * 职责：
 *   - 读 progress-store.stage
 *   - 按 stage.kind 渲染对应视图组件
 *   - done → 重定向到 /learn/done
 */

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'

import { ConceptView } from '@/components/learn/ConceptView'
import { FeynmanIntroView } from '@/components/learn/FeynmanIntroView'
import { FeynmanStepView } from '@/components/learn/FeynmanStepView'
import { FeynmanFinalView } from '@/components/learn/FeynmanFinalView'
import { ModuleIntroView } from '@/components/learn/ModuleIntroView'

export default function ModulePage() {
  const router = useRouter()
  const hydrated = useHydrated()
  const currentModule = useModuleStore((s) => s.currentModule)
  const stage = useProgressStore((s) => s.stage)

  // 无 Module 数据时回到导入页（等 hydration 完成后再检查）
  useEffect(() => {
    if (hydrated && !currentModule) {
      router.replace('/learn/import')
    }
  }, [hydrated, currentModule, router])

  // done → 重定向
  useEffect(() => {
    if (stage?.kind === 'done') {
      router.replace('/learn/done')
    }
  }, [stage, router])

  if (!currentModule || !stage) return null

  switch (stage.kind) {
    case 'module_intro':
      return <ModuleIntroView />

    case 'concept':
      return <ConceptView conceptIndex={stage.conceptIndex} quizIndex={stage.quizIndex} />

    case 'challenge':
      // W9 Should 项，当前直接跳到 feynman
      return (
        <div className="min-h-screen flex items-center justify-center text-neutral-500">
          <p>Module Challenge 即将上线</p>
        </div>
      )

    case 'feynman_intro':
      return <FeynmanIntroView />

    case 'feynman_step':
      return <FeynmanStepView stepOrder={stage.stepOrder} />

    case 'feynman_final':
      return <FeynmanFinalView />

    case 'done':
      return null // redirect handled by useEffect

    default:
      // exhaustive check
      return (
        <div className="min-h-screen flex items-center justify-center text-neutral-500">
          <p>未知学习阶段</p>
        </div>
      )
  }
}
