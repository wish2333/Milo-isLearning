'use client'

/**
 * 导入页 — Markdown 输入入口
 *
 * 对应 docs/M4-M5-Plan.md W2 / FR-01 / US-02。
 * UI 参考：docs/ui-design/01-home.html
 *
 * 功能：
 *   - Markdown 文本框（textarea）
 *   - 实时字数计数器（200-20000 范围）
 *   - LLM 配置检查（未配置时引导到 Settings）
 *   - 点击编译 → 存 sessionStorage → 路由到编译中页
 */

import { useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'

import { INPUT_MAX_LENGTH, INPUT_MIN_LENGTH } from '@/lib/compiler/pipeline/types'
import { storage } from '@/lib/persistence/local-storage'
import { createCompileJob } from '@/lib/state/compile-job-store'
import { useSettingsStore } from '@/lib/state/settings-store'

const STORAGE_KEY = 'alc:compile-source'

export default function ImportPage() {
  const router = useRouter()
  const config = useSettingsStore((s) => s.config)

  const [markdown, setMarkdown] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const charCount = markdown.length
  const isValid = charCount >= INPUT_MIN_LENGTH && charCount <= INPUT_MAX_LENGTH
  const isShort = charCount > 0 && charCount < INPUT_MIN_LENGTH

  const handleCompile = useCallback(() => {
    if (!isValid || submitting) return

    if (!config) {
      router.push('/settings')
      return
    }

    // 保留 sessionStorage（兼容现有 compiling 页逻辑）
    sessionStorage.setItem(STORAGE_KEY, markdown)

    // M7.5：写入 compile job store，刷新后可恢复
    const job = createCompileJob(storage, {
      sourceContent: markdown,
      configSummary: { provider: config.provider, model: config.model },
    })

    setSubmitting(true)
    router.push(`/learn/compiling?jobId=${job.jobId}`)
  }, [isValid, submitting, config, markdown, router])

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-medium text-neutral-200">导入知识</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/learn/library')}
              className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              我的题库
            </button>
            <button
              onClick={() => router.push('/settings')}
              className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              {config ? '设置' : '配置 LLM'}
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-3xl space-y-6">
          {/* Intro */}
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-neutral-100">
              粘贴 Markdown，编译为学习路径
            </h2>
            <p className="text-sm text-neutral-500">
              支持任意技术文档、教程、笔记。AI 将自动拆分概念、生成练习、设计费曼任务。
            </p>
          </div>

          {/* Textarea */}
          <div className="space-y-2">
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              placeholder="在此粘贴 Markdown 内容..."
              className="w-full h-72 bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 resize-none font-mono"
              maxLength={INPUT_MAX_LENGTH + 1000}
            />

            {/* Character counter */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600">
                {charCount === 0 ? '等待输入...' : `${charCount.toLocaleString()} 字`}
              </span>
              <span
                className={
                  isShort
                    ? 'text-amber-500/70'
                    : isValid
                      ? 'text-emerald-500/70'
                      : charCount > INPUT_MAX_LENGTH
                        ? 'text-red-500/70'
                        : 'text-neutral-600'
                }
              >
                {INPUT_MIN_LENGTH} - {INPUT_MAX_LENGTH.toLocaleString()} 字
              </span>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleCompile}
            disabled={!isValid || submitting}
            className="w-full py-3 rounded-lg bg-neutral-100 text-neutral-900 font-medium text-sm hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors"
          >
            {!config ? '配置 LLM 后开始' : submitting ? '准备中...' : '开始编译'}
          </button>

          {!config && (
            <p className="text-xs text-amber-500/60 text-center">需要先配置 LLM 供应商才能编译</p>
          )}
        </div>
      </div>
    </main>
  )
}
