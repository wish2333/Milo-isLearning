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
import { useParams } from 'next/navigation'
import { useEffect } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { StorageKeys } from '@/lib/persistence/keys'
import { storage } from '@/lib/persistence/local-storage'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import type { Module } from '@/types/domain'

import { ConceptView } from '@/components/learn/ConceptView'
import { ChallengeView } from '@/components/learn/ChallengeView'
import { FeynmanIntroView } from '@/components/learn/FeynmanIntroView'
import { FeynmanStepView } from '@/components/learn/FeynmanStepView'
import { FeynmanFinalView } from '@/components/learn/FeynmanFinalView'
import { ModuleIntroView } from '@/components/learn/ModuleIntroView'

export default function ModulePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const hydrated = useHydrated()
  const currentModule = useModuleStore((s) => s.currentModule)
  const setModule = useModuleStore((s) => s.setModule)
  const stage = useProgressStore((s) => s.stage)
  const routeModuleId = params.id

  useEffect(() => {
    if (!hydrated || !routeModuleId) return
    if (currentModule?.id === routeModuleId) return

    const storedModule = storage.get<Module>(StorageKeys.module(routeModuleId))
    if (storedModule) {
      setModule(storedModule)
      return
    }

    router.replace('/learn/library')
  }, [hydrated, routeModuleId, currentModule?.id, setModule, router])

  // 无 Module 数据时回到题库页（等 hydration 和 route 恢复完成后再检查）
  useEffect(() => {
    if (
      hydrated &&
      routeModuleId &&
      !currentModule &&
      !storage.has(StorageKeys.module(routeModuleId))
    ) {
      router.replace('/learn/library')
    }
  }, [hydrated, routeModuleId, currentModule, router])

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
      return <ChallengeView quizIndex={stage.quizIndex} />

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
