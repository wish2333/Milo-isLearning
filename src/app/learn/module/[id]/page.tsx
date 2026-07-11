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
import type React from 'react'
import { useEffect } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { StorageKeys } from '@/lib/persistence/keys'
import { storage } from '@/lib/persistence/local-storage'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useTopicSessionStore } from '@/lib/state/topic-session-store'
import type { Module } from '@/types/domain'
import type { ModuleStage } from '@/types/domain'

import { ConceptView } from '@/components/learn/ConceptView'
import { ChallengeView } from '@/components/learn/ChallengeView'
import { FeynmanIntroView } from '@/components/learn/FeynmanIntroView'
import { FeynmanStepView } from '@/components/learn/FeynmanStepView'
import { FeynmanFinalView } from '@/components/learn/FeynmanFinalView'
import { ModuleIntroView } from '@/components/learn/ModuleIntroView'
import { LearnShell } from '@/components/learn/LearnShell'

function getStageLabel(stage: ModuleStage): string {
  switch (stage.kind) {
    case 'concept':
      return 'Concept'
    case 'challenge':
      return 'Challenge'
    case 'feynman_intro':
    case 'feynman_step':
    case 'feynman_final':
      return 'Feynman'
    case 'done':
      return 'Done'
    case 'module_intro':
      return 'Intro'
  }
}

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

  // done → 重定向（主题会话拦截）
  useEffect(() => {
    if (stage?.kind !== 'done') return

    const topicSession = useTopicSessionStore.getState().session
    if (topicSession && topicSession.moduleIds[topicSession.currentIndex] === routeModuleId) {
      useTopicSessionStore.getState().markCurrentModuleDone()
      router.replace(`/learn/topic/${topicSession.topicId}`)
    } else {
      router.replace('/learn/done')
    }
  }, [stage, router, routeModuleId])

  if (!currentModule || !stage) return null

  let content: React.ReactNode
  switch (stage.kind) {
    case 'module_intro':
      content = <ModuleIntroView />
      break

    case 'concept':
      content = <ConceptView conceptIndex={stage.conceptIndex} quizIndex={stage.quizIndex} />
      break

    case 'challenge':
      content = <ChallengeView quizIndex={stage.quizIndex} />
      break

    case 'feynman_intro':
      content = <FeynmanIntroView />
      break

    case 'feynman_step':
      content = <FeynmanStepView stepOrder={stage.stepOrder} />
      break

    case 'feynman_final':
      content = <FeynmanFinalView />
      break

    case 'done':
      return null // redirect handled by useEffect

    default:
      // exhaustive check
      content = (
        <div className="min-h-screen flex items-center justify-center text-fg-tertiary">
          <p>未知学习阶段</p>
        </div>
      )
  }

  return (
    <LearnShell moduleId={currentModule.id} stageLabel={getStageLabel(stage)}>
      {content}
    </LearnShell>
  )
}
