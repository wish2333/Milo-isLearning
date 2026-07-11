'use client'

/**
 * TopicCreator — 创建/编辑主题的模态对话框（M8.1 Task 4）
 */

import { useState } from 'react'

import type { Topic } from '@/types/domain'
import type { StoredModuleSummary } from '@/lib/persistence/module-library'

interface TopicCreatorProps {
  mode: 'create' | 'edit'
  topic?: Topic
  modules: StoredModuleSummary[]
  onSave: (data: { name: string; description?: string; moduleIds: string[] }) => void
  onCancel: () => void
}

export function TopicCreator({ mode, topic, modules, onSave, onCancel }: TopicCreatorProps) {
  const [name, setName] = useState(topic?.name ?? '')
  const [description, setDescription] = useState(topic?.description ?? '')
  const [selectedIds, setSelectedIds] = useState<string[]>(
    topic?.moduleIds ? [...topic.moduleIds] : [],
  )

  const handleToggleModule = (moduleId: string) => {
    setSelectedIds((prev) =>
      prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId],
    )
  }

  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    setSelectedIds((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
      return next
    })
  }

  const handleMoveDown = (index: number) => {
    setSelectedIds((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1]!, next[index]!]
      return next
    })
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      moduleIds: selectedIds,
    })
  }

  const moduleMap = new Map(modules.map((m) => [m.id, m]))

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-w-lg w-full alc-card-elevated p-6 space-y-5 max-h-[80vh] overflow-y-auto">
        <h3 className="text-base font-medium text-fg-primary">
          {mode === 'create' ? '创建主题' : '编辑主题'}
        </h3>

        {/* 主题名称 */}
        <div className="space-y-1.5">
          <label htmlFor="topic-name" className="alc-label text-xs">
            主题名称 <span className="text-danger">*</span>
          </label>
          <input
            id="topic-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入主题名称"
            maxLength={80}
            className="w-full bg-bg-surface border border-border-default rounded px-3 py-2 text-sm text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:border-accent-primary"
          />
        </div>

        {/* 描述 */}
        <div className="space-y-1.5">
          <label htmlFor="topic-desc" className="alc-label text-xs">
            描述（可选）
          </label>
          <textarea
            id="topic-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简要描述主题内容和学习目标"
            rows={2}
            maxLength={200}
            className="w-full bg-bg-surface border border-border-default rounded px-3 py-2 text-sm text-fg-primary placeholder:text-fg-quaternary focus:outline-none focus:border-accent-primary resize-none"
          />
        </div>

        {/* 模块多选 + 排序 */}
        <div className="space-y-2">
          <p className="alc-label text-xs">选择并排序模块</p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {selectedIds.map((id, index) => {
              const m = moduleMap.get(id)
              if (!m) return null
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 bg-bg-surface border border-border-default rounded px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked
                    onChange={() => handleToggleModule(id)}
                    className="shrink-0"
                  />
                  <span className="flex-1 truncate text-fg-primary">{m.title}</span>
                  <span className="text-fg-tertiary text-xs shrink-0">
                    {m.conceptCount}C·{m.quizCount}Q
                  </span>
                  <div className="flex flex-col gap-0 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="text-fg-tertiary hover:text-fg-primary text-xs leading-none disabled:opacity-30"
                      aria-label="上移"
                    >
                      &#9650;
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === selectedIds.length - 1}
                      className="text-fg-tertiary hover:text-fg-primary text-xs leading-none disabled:opacity-30"
                      aria-label="下移"
                    >
                      &#9660;
                    </button>
                  </div>
                </div>
              )
            })}
            {modules
              .filter((m) => !selectedIds.includes(m.id))
              .map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 bg-bg-surface border border-border-default rounded px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => handleToggleModule(m.id)}
                    className="shrink-0"
                  />
                  <span className="flex-1 truncate text-fg-primary">{m.title}</span>
                  <span className="text-fg-tertiary text-xs shrink-0">
                    {m.conceptCount}C·{m.quizCount}Q
                  </span>
                  <div className="w-4 shrink-0" /> {/* 占位保持对齐 */}
                </div>
              ))}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="alc-button-primary flex-1 text-sm disabled:opacity-40"
          >
            保存
          </button>
          <button type="button" onClick={onCancel} className="alc-button-secondary flex-1 text-sm">
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
