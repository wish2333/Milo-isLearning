'use client'

/**
 * 作答记录页 — 查看某 Module 的全部答题历史
 *
 * 从题库列表的"作答记录"按钮进入。
 * 读取 Module 本体（storage）+ 作答记录（attempts-store），
 * 通过 AnswerHistoryList 展示每道已作答题的详情。
 */

import { useRouter, useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useHydrated } from '@/lib/hooks/useHydrated'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { getStorageValueWithLegacyFallback } from '@/lib/persistence/client/storage'
import { downloadWrongQuestionBook, hasWrongQuestions } from '@/lib/persistence/wrong-question-book'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useModuleStore } from '@/lib/state/module-store'
import type { Module } from '@/types/domain'

import { AnswerHistoryList } from '@/components/learn/AnswerHistoryList'

export default function HistoryPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const hydrated = useHydrated()
  const setModule = useModuleStore((s) => s.setModule)

  const [moduleData, setModuleData] = useState<Module | null>(null)
  const [notFound, setNotFound] = useState(false)

  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)

  useEffect(() => {
    if (!hydrated || !params.id) return
    const stored = getStorageValueWithLegacyFallback<Module>(StorageKeys.module(params.id))
    if (stored) {
      setModule(stored)
      setModuleData(stored)
    } else {
      setNotFound(true)
    }
  }, [hydrated, params.id, setModule])

  const hasWrong = useMemo(
    () => (moduleData ? hasWrongQuestions(moduleData, attemptsBySlot) : false),
    [moduleData, attemptsBySlot],
  )

  const handleExportWrongBook = () => {
    if (!moduleData) return
    downloadWrongQuestionBook(moduleData, attemptsBySlot)
  }

  if (!hydrated) return null

  if (notFound) {
    return (
      <main className="alc-page">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center space-y-4">
          <p className="text-sm text-fg-secondary">Module 不存在或已被删除</p>
          <button
            type="button"
            onClick={() => router.push('/learn/library')}
            className="alc-button-secondary text-sm px-4 py-2"
          >
            返回题库
          </button>
        </div>
      </main>
    )
  }

  if (!moduleData) return null

  return (
    <main className="alc-page">
      {/* Content */}
      <div className="flex-1 max-w-2xl w-full mx-auto px-6 py-8 space-y-6">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="alc-label">作答记录</p>
            <h1 className="text-lg font-medium text-fg-primary">{moduleData.title}</h1>
          </div>
          {hasWrong && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportWrongBook}
                className="alc-button-secondary text-xs px-3 py-1.5"
              >
                导出错题本
              </button>
              <button
                type="button"
                onClick={() => router.push(`/learn/review/${moduleData.id}`)}
                className="alc-button-secondary text-xs px-3 py-1.5"
              >
                重刷错题
              </button>
            </div>
          )}
        </div>
        <AnswerHistoryList module={moduleData} />
      </div>
    </main>
  )
}
