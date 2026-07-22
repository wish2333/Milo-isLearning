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
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { getStorageValueWithLegacyFallback } from '@/lib/persistence/client/storage'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useTopicSessionStore } from '@/lib/state/topic-session-store'
import { enterModule } from '@/lib/runtime/enter-module'
import type { Module } from '@/types/domain'
import type { ModuleStage } from '@/types/domain'

import { ConceptView } from '@/components/learn/ConceptView'
import { ChallengeView } from '@/components/learn/ChallengeView'
import { FeynmanIntroView } from '@/components/learn/FeynmanIntroView'
import { FeynmanStepView } from '@/components/learn/FeynmanStepView'
import { FeynmanFinalView } from '@/components/learn/FeynmanFinalView'
import { ModuleIntroView } from '@/components/learn/ModuleIntroView'
import { KnowledgePageView } from '@/components/learn/KnowledgePageView'
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
    case 'concept_intro':
      return stage.kind === 'module_intro' ? 'Intro' : '概念导论'
  }
}

export default function ModulePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const hydrated = useHydrated()
  const currentModule = useModuleStore((s) => s.currentModule)
  const stage = useProgressStore((s) => s.stage)
  const progressModuleId = useProgressStore((s) => s.moduleId)
  const routeModuleId = params.id

  useEffect(() => {
    if (!hydrated || !routeModuleId) return
    // 同时校验 module-store 与 progress-store 都指向当前模块：题库页 handleOpen
    // 等入口只 setModule 不 resumeModule，若仅凭 currentModule?.id 早返回，
    // progress-store.moduleId 会停在旧模块，作答 stage 被错写到旧模块 per-module key。
    if (currentModule?.id === routeModuleId && progressModuleId === routeModuleId) return

    const entered = enterModule({ moduleId: routeModuleId, allowResume: true })
    if (!entered) {
      router.replace('/learn/library')
    }
  }, [hydrated, routeModuleId, currentModule?.id, progressModuleId, router])

  // 无 Module 数据时回到题库页（等 hydration 和 route 恢复完成后再检查）
  useEffect(() => {
    if (
      hydrated &&
      routeModuleId &&
      !currentModule &&
      !getStorageValueWithLegacyFallback<Module>(StorageKeys.module(routeModuleId))
    ) {
      router.replace('/learn/library')
    }
  }, [hydrated, routeModuleId, currentModule, router])

  // done → 重定向（主题会话拦截）
  useEffect(() => {
    if (stage?.kind !== 'done') return

    const topicSession = useTopicSessionStore.getState().session
    if (!topicSession || !topicSession.moduleIds.includes(routeModuleId)) {
      router.replace('/learn/done')
      return
    }
    if (topicSession.moduleIds[topicSession.currentIndex] === routeModuleId) {
      useTopicSessionStore.getState().markCurrentModuleDone()
    } else {
      // 用户偏离主题编排（如从题库直进）学完了主题内其他模块：也标记完成，避免主题进度卡死
      useTopicSessionStore.getState().markModuleDone(routeModuleId)
    }
    router.replace(`/learn/topic/${topicSession.topicId}`)
  }, [stage, router, routeModuleId])

  if (!currentModule || !stage) return null

  let content: React.ReactNode
  switch (stage.kind) {
    case 'module_intro':
      content = <ModuleIntroView />
      break

    case 'concept_intro':
      content = <KnowledgePageView conceptIndex={stage.conceptIndex} />
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

  return <LearnShell stageLabel={getStageLabel(stage)}>{content}</LearnShell>
}
