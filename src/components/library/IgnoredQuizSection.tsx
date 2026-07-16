'use client'

/**
 * IgnoredQuizSection — 已忽略题目列表（F41 恢复）
 *
 * 展示所有用户模块中 ignored === true 的题目，按模块分组。
 * 支持单题恢复、按模块批量恢复、全部恢复。
 * 仅在存在已忽略题目时渲染；展示模块不可见（origin==='showcase'）。
 */

import { useMemo, useCallback } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { useRuntimeMode } from '@/lib/state/runtime-mode-store'
import { storage } from '@/lib/persistence/client/local-storage'
import { loadStoredModule, updateQuizInModule } from '@/lib/persistence/module-library'
import { useModuleStore } from '@/lib/state/module-store'
import type { Module, Quiz } from '@/types/domain'

interface IgnoredQuizEntry {
  quiz: Quiz
  /** 所属 Concept 名称；Challenge 题为 null */
  conceptTitle: string | null
}

interface ModuleIgnoredGroup {
  moduleId: string
  moduleTitle: string
  quizzes: IgnoredQuizEntry[]
}

/** 截断文本 */
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}

/** 题型显示名 */
function interactionLabel(type: Quiz['interactionType']): string {
  switch (type) {
    case 'choice':
      return '选择'
    case 'sorting':
      return '排序'
    case 'fill_blank':
      return '填空'
  }
}

/** 从 storage 扫描所有模块中已忽略的题目 */
function collectIgnoredQuizzes(): ModuleIgnoredGroup[] {
  const studioMode = useRuntimeMode.getState().studioMode
  const effectiveShowcase = isShowcaseMode && !studioMode

  const keys = storage.keys()
  const groups: ModuleIgnoredGroup[] = []

  for (const key of keys) {
    if (!key.startsWith('alc:module:')) continue

    const mod = storage.get<Module>(key)
    if (!mod) continue

    // 只展示用户模块（展示模块不可修改）
    if (effectiveShowcase ? mod.origin !== 'showcase' : mod.origin === 'showcase') continue

    const entries: IgnoredQuizEntry[] = []

    // Concept quizzes
    for (const concept of mod.concepts) {
      for (const quiz of concept.quizSeries.quizzes) {
        if (quiz.ignored === true) {
          entries.push({ quiz, conceptTitle: concept.name })
        }
      }
    }

    // Challenge quizzes
    if (mod.challengeQuizzes) {
      for (const quiz of mod.challengeQuizzes) {
        if (quiz.ignored === true) {
          entries.push({ quiz, conceptTitle: null })
        }
      }
    }

    if (entries.length > 0) {
      groups.push({ moduleId: mod.id, moduleTitle: mod.title, quizzes: entries })
    }
  }

  return groups
}

export function IgnoredQuizSection() {
  const hydrated = useHydrated()

  const groups = useMemo(() => {
    if (!hydrated) return []
    return collectIgnoredQuizzes()
  }, [hydrated])

  const totalCount = useMemo(() => groups.reduce((sum, g) => sum + g.quizzes.length, 0), [groups])

  const restoreQuiz = useCallback((moduleId: string, quizId: string) => {
    const mod = loadStoredModule(storage, moduleId)
    if (!mod) return

    // 确保当前 module-store 加载了该模块（correctQuizAnswer 只更新 currentModule）
    const current = useModuleStore.getState().currentModule
    if (current?.id === moduleId) {
      useModuleStore.getState().correctQuizAnswer(quizId, { ignored: false })
    } else {
      // 不在 currentModule 中：直接调用底层 updateQuizInModule
      updateQuizInModule(storage, moduleId, quizId, { ignored: false })
    }
  }, [])

  const restoreModuleAll = useCallback(
    (group: ModuleIgnoredGroup) => {
      for (const entry of group.quizzes) {
        restoreQuiz(group.moduleId, entry.quiz.id)
      }
    },
    [restoreQuiz],
  )

  const restoreAll = useCallback(() => {
    for (const group of groups) {
      restoreModuleAll(group)
    }
  }, [groups, restoreModuleAll])

  if (!hydrated || totalCount === 0) return null

  return (
    <section className="space-y-4 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-fg-primary">已忽略的题目（{totalCount}）</h2>
        <button
          type="button"
          onClick={restoreAll}
          className="alc-button-primary text-xs px-3 py-1.5"
        >
          全选恢复
        </button>
      </div>

      {/* Per-module groups */}
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.moduleId} className="alc-card p-4 space-y-2">
            {/* Module header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-fg-primary">{group.moduleTitle}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-warning-soft text-warning">
                  {group.quizzes.length} 题已忽略
                </span>
              </div>
              <button
                type="button"
                onClick={() => restoreModuleAll(group)}
                className="alc-button-secondary text-xs px-3 py-1.5"
              >
                恢复全部
              </button>
            </div>

            {/* Quiz items */}
            <ul className="space-y-1.5 pl-2">
              {group.quizzes.map((entry) => (
                <li key={entry.quiz.id} className="flex items-center justify-between gap-3 py-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-fg-tertiary shrink-0">
                      {interactionLabel(entry.quiz.interactionType)}
                    </span>
                    {entry.conceptTitle && (
                      <span className="alc-label truncate shrink-0 max-w-[120px]">
                        {truncate(entry.conceptTitle, 16)}
                      </span>
                    )}
                    <span className="text-sm text-fg-secondary truncate">
                      {truncate(entry.quiz.stem, 40)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => restoreQuiz(group.moduleId, entry.quiz.id)}
                    className="alc-button-secondary text-xs px-2 py-1 shrink-0"
                  >
                    恢复
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
