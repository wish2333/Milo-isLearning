'use client'

import { useEffect, useState } from 'react'

import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'

interface KnowledgePageViewProps {
  conceptIndex: number
}

export function KnowledgePageView({ conceptIndex }: KnowledgePageViewProps) {
  const currentModule = useModuleStore((s) => s.currentModule)
  const updateKnowledgePage = useModuleStore((s) => s.updateKnowledgePage)
  const advance = useProgressStore((s) => s.advance)

  const [editing, setEditing] = useState(false)
  const [editingContent, setEditingContent] = useState('')

  const concept = currentModule?.concepts[conceptIndex]

  const canEdit = currentModule?.origin !== 'showcase'

  useEffect(() => {
    if (editing && concept?.knowledgePage) {
      setEditingContent(concept.knowledgePage)
    }
  }, [editing, concept?.knowledgePage])

  useEffect(() => {
    if (concept && !concept.knowledgePage) {
      advance()
    }
  }, [concept, advance])

  if (!concept) return null

  const handleSave = () => {
    if (!editingContent.trim()) return
    updateKnowledgePage(concept.id, editingContent.trim())
    setEditing(false)
  }

  const handleCancel = () => {
    setEditing(false)
  }

  if (!concept.knowledgePage) return null

  return (
    <div className="text-fg-primary">
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-8">
        <div className="space-y-2">
          <p className="text-xs text-fg-quaternary uppercase tracking-wider">知识导论</p>
          <h1 className="text-3xl font-semibold">{concept.name}</h1>
          <span className="text-xs text-fg-quaternary">AI 生成</span>
        </div>

        {editing ? (
          <div className="space-y-4">
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              className="w-full h-96 rounded-lg border border-border-strong bg-bg-secondary px-4 py-3 text-sm text-fg-primary resize-y focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-accent-primary text-bg-base text-sm font-medium hover:bg-accent-primary-hover transition-colors"
              >
                保存
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg border border-border-strong text-fg-secondary text-sm hover:text-fg-primary transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <article className="text-base text-fg-secondary leading-relaxed whitespace-pre-wrap">
            {concept.knowledgePage}
          </article>
        )}

        <div className="flex gap-3">
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="px-4 py-2 rounded-lg border border-border-strong text-fg-secondary text-sm hover:text-fg-primary transition-colors"
            >
              编辑
            </button>
          )}
          <button
            onClick={advance}
            className="flex-1 py-3 rounded-lg bg-accent-primary text-bg-base font-medium text-sm hover:bg-accent-primary-hover transition-colors"
          >
            开始练习
          </button>
        </div>
      </div>
    </div>
  )
}
