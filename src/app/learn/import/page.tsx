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
 *   - 点击编译 -> 存 sessionStorage -> 路由到编译中页
 *   - PB.3: production 模式检测未完成编译，显示恢复提示
 */

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CompileStage } from '@/lib/compiler/pipeline/types'
import { isProductionMode } from '@/lib/runtime/app-mode'
import { track } from '@/lib/runtime/analytics'
import { INPUT_MAX_LENGTH, INPUT_MIN_LENGTH } from '@/lib/compiler/pipeline/types'
import { storage } from '@/lib/persistence/client/local-storage'
import { createTopic } from '@/lib/persistence/topic-library'
import { createCompileJob } from '@/lib/state/compile-job-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import { CompileResumePrompt } from '@/components/learn/CompileResumePrompt'
import type { TopicExpandRequest } from '@/components/learn/ExpandJobView'

const STORAGE_KEY = 'alc:compile-source'
const TOPIC_EXPAND_REQUEST_KEY = 'alc:topic-expand-request'

/** 通过 Web Crypto API 计算 SHA-256 hex digest */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

interface ResumeInfo {
  sessionId: string
  lastStage: CompileStage | null
}

export default function ImportPage() {
  const router = useRouter()
  const config = useSettingsStore((s) => s.config)

  const [mode, setMode] = useState<'markdown' | 'expand' | 'topic-expand'>('markdown')
  const [markdown, setMarkdown] = useState('')
  const [topic, setTopic] = useState('')
  const [constraints, setConstraints] = useState('')
  const [batchTopicName, setBatchTopicName] = useState('')
  const [batchSources, setBatchSources] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null)
  const [dismissedResume, setDismissedResume] = useState(false)
  const resumeCheckDoneRef = useRef(false)

  const charCount = markdown.length
  const isValid = charCount >= INPUT_MIN_LENGTH && charCount <= INPUT_MAX_LENGTH
  const isShort = charCount > 0 && charCount < INPUT_MIN_LENGTH

  const topicLen = topic.trim().length
  const isTopicValid = topicLen >= 5 && topicLen <= 50
  const batchItems = batchSources
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  const isBatchValid =
    isProductionMode &&
    batchTopicName.trim().length >= 1 &&
    batchTopicName.trim().length <= 50 &&
    batchItems.length > 0 &&
    batchItems.every((item) => item.length >= 5 && item.length <= 50)

  // PB.3: production 模式下，检测未完成的编译 session
  useEffect(() => {
    if (!isProductionMode) return
    if (resumeCheckDoneRef.current) return

    let cancelled = false

    async function checkResume() {
      // 仅在有输入内容时检查（用户粘贴了 markdown 后回到此页面）
      const savedSource = sessionStorage.getItem(STORAGE_KEY)
      if (!savedSource) return

      try {
        const sourceHash = await sha256(savedSource)

        // POST 创建/查找 session（如果已有 active session 会返回 resumed=true）
        const sessionRes = await fetch('/api/compile/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceHash }),
        })
        if (!sessionRes.ok || cancelled) return

        const sessionData = await sessionRes.json()
        if (!sessionData.sessionId) return

        // 如果是新创建的（非 resumed），没有可恢复的检查点
        if (!sessionData.resumed) return

        // 有可恢复的 session -> 查询 checkpoint 信息
        const resumeRes = await fetch(`/api/compile/resume?sessionId=${sessionData.sessionId}`)
        if (!resumeRes.ok || cancelled) return

        const resumeData = await resumeRes.json()
        if (!resumeData.lastStage) return

        setResumeInfo({
          sessionId: sessionData.sessionId,
          lastStage: resumeData.lastStage,
        })
      } catch {
        // 网络错误或 showcase 模式 -> 静默忽略
      }
    }

    checkResume()
    resumeCheckDoneRef.current = true

    return () => {
      cancelled = true
    }
  }, [])

  const handleResume = useCallback(() => {
    if (!resumeInfo) return
    setDismissedResume(true)

    // 将源文本放回 sessionStorage
    sessionStorage.setItem(STORAGE_KEY, markdown || sessionStorage.getItem(STORAGE_KEY) || '')

    // 创建 compile job，携带 sessionId
    const sourceContent = markdown || sessionStorage.getItem(STORAGE_KEY) || ''
    const job = createCompileJob(storage, {
      sourceContent,
      configSummary: { provider: config?.provider ?? '', model: config?.model ?? '' },
      sessionId: resumeInfo.sessionId,
    })

    track('compile_resume', { sessionId: resumeInfo.sessionId })
    router.push(
      `/learn/compiling?jobId=${job.jobId}&resumeFrom=${resumeInfo.lastStage}&sessionId=${resumeInfo.sessionId}`,
    )
  }, [resumeInfo, markdown, config, router])

  const handleRestart = useCallback(async () => {
    if (!resumeInfo) return
    setDismissedResume(true)

    try {
      await fetch(`/api/compile/session?sessionId=${resumeInfo.sessionId}`, {
        method: 'DELETE',
      })
    } catch {
      // 静默忽略
    }

    setResumeInfo(null)
  }, [resumeInfo])

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
    track('compile_start', {
      mode: 'markdown',
      sourceLength: markdown.length,
      provider: config.provider ?? 'unknown',
    })
    router.push(`/learn/compiling?jobId=${job.jobId}`)
  }, [isValid, submitting, config, markdown, router])

  const handleExpandCompile = useCallback(() => {
    if (!isTopicValid || submitting) return

    if (!config) {
      router.push('/settings')
      return
    }

    const trimmedTopic = topic.trim()
    sessionStorage.setItem(STORAGE_KEY, trimmedTopic)

    const job = createCompileJob(storage, {
      sourceContent: trimmedTopic,
      configSummary: { provider: config.provider, model: config.model },
      compileMode: 'expand',
      topic: trimmedTopic,
      constraints: constraints.trim() || undefined,
    })

    setSubmitting(true)
    track('compile_start', {
      mode: 'expand',
      topicLength: trimmedTopic.length,
      provider: config.provider ?? 'unknown',
    })
    router.push(`/learn/compiling?jobId=${job.jobId}`)
  }, [isTopicValid, submitting, config, topic, constraints, router])

  const handleTopicExpandCompile = useCallback(async () => {
    if (!isBatchValid || submitting || !config) {
      if (!config && isBatchValid) router.push('/settings')
      return
    }

    const name = batchTopicName.trim()
    const items = batchItems
    const normalizedConstraints = constraints.trim() || undefined
    const sourceHash = await sha256(
      JSON.stringify({ name, items, constraints: normalizedConstraints ?? '' }),
    )
    const createdTopic = createTopic(storage, name, normalizedConstraints)
    const request: TopicExpandRequest = {
      topicId: createdTopic.id,
      sourceHash,
      items,
      ...(normalizedConstraints !== undefined ? { constraints: normalizedConstraints } : {}),
    }
    sessionStorage.setItem(TOPIC_EXPAND_REQUEST_KEY, JSON.stringify(request))
    setSubmitting(true)
    track('compile_start', {
      mode: 'topic-expand',
      topicLength: items.join('\n').length,
      provider: config.provider ?? 'unknown',
    })
    router.push('/learn/expand-job')
  }, [batchItems, batchTopicName, config, constraints, isBatchValid, router, submitting])

  const showResumePrompt = isProductionMode && resumeInfo && !dismissedResume

  return (
    <main className="alc-page">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-3xl space-y-6">
          {/* Intro */}
          <div className="space-y-1">
            <p className="alc-label uppercase tracking-wider">Source material</p>
            <h2 className="text-2xl font-semibold text-fg-primary">
              {mode === 'markdown'
                ? '粘贴 Markdown，编译为学习路径'
                : mode === 'expand'
                  ? '输入主题，AI 扩充为学习路径'
                  : '批量输入主题，生成一个学习主题'}
            </h2>
            <p className="text-sm text-fg-secondary">
              {mode === 'markdown'
                ? '支持任意技术文档、教程、笔记。AI 将自动拆分概念、生成练习、设计费曼任务。'
                : mode === 'expand'
                  ? '只需一个短主题词，AI 自动扩充知识材料并编译为完整学习模块。'
                  : '每行一个 5-50 字主题词；任务按顺序串行生成，失败项可单独重试。'}
            </p>
          </div>

          {/* PB.3: Resume prompt */}
          {showResumePrompt && (
            <CompileResumePrompt
              sessionId={resumeInfo.sessionId}
              lastStage={resumeInfo.lastStage}
              onResume={handleResume}
              onRestart={handleRestart}
            />
          )}

          {/* Mode tab */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('markdown')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                mode === 'markdown'
                  ? 'bg-accent-primary text-bg-base'
                  : 'border border-border-strong text-fg-secondary hover:bg-bg-elevated'
              }`}
            >
              📝 粘贴 Markdown
            </button>
            <button
              type="button"
              onClick={() => setMode('expand')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                mode === 'expand'
                  ? 'bg-accent-primary text-bg-base'
                  : 'border border-border-strong text-fg-secondary hover:bg-bg-elevated'
              }`}
            >
              ✨ AI 扩充
            </button>
            {isProductionMode && (
              <button
                type="button"
                onClick={() => setMode('topic-expand')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'topic-expand'
                    ? 'bg-accent-primary text-bg-base'
                    : 'border border-border-strong text-fg-secondary hover:bg-bg-elevated'
                }`}
              >
                📚 批量主题
              </button>
            )}
          </div>

          {/* Markdown mode form */}
          {mode === 'markdown' && (
            <>
              <div className="space-y-2">
                <textarea
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  placeholder="在此粘贴 Markdown 内容..."
                  className="alc-textarea h-72 text-sm font-mono"
                  maxLength={INPUT_MAX_LENGTH + 1000}
                />

                <div className="flex items-center justify-between text-xs">
                  <span className="alc-muted">
                    {charCount === 0 ? '等待输入...' : `${charCount.toLocaleString()} 字`}
                  </span>
                  <span
                    className={
                      isShort
                        ? 'text-warning'
                        : isValid
                          ? 'text-success'
                          : charCount > INPUT_MAX_LENGTH
                            ? 'text-danger'
                            : 'alc-muted'
                    }
                  >
                    {INPUT_MIN_LENGTH} - {INPUT_MAX_LENGTH.toLocaleString()} 字
                  </span>
                </div>
              </div>

              <button
                onClick={handleCompile}
                disabled={!isValid || submitting}
                className="alc-button-primary w-full py-3 text-sm"
              >
                {!config ? '配置 LLM 后开始' : submitting ? '准备中...' : '开始编译'}
              </button>
            </>
          )}

          {/* Expand mode form */}
          {mode === 'expand' && (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="alc-label uppercase tracking-wider">主题词</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="例：注意力机制、RAG 检索增强生成、梯度下降..."
                    className="alc-textarea py-3 text-sm"
                    maxLength={50}
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="alc-muted">
                      {topicLen === 0 ? '等待输入...' : `${topicLen} 字`}
                    </span>
                    <span
                      className={
                        isTopicValid ? 'text-success' : topicLen > 0 ? 'text-warning' : 'alc-muted'
                      }
                    >
                      5 - 50 字
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="alc-label uppercase tracking-wider">约束（可选）</label>
                  <textarea
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="例：面向工程师，侧重实践；或：覆盖原理和常见误区..."
                    className="alc-textarea h-24 text-sm"
                    maxLength={200}
                  />
                </div>
              </div>

              <button
                onClick={handleExpandCompile}
                disabled={!isTopicValid || submitting}
                className="alc-button-primary w-full py-3 text-sm"
              >
                {!config ? '配置 LLM 后开始' : submitting ? '准备中...' : '开始 AI 扩充'}
              </button>
            </>
          )}

          {mode === 'topic-expand' && isProductionMode && (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="alc-label uppercase tracking-wider">Topic 名称</label>
                  <input
                    type="text"
                    value={batchTopicName}
                    onChange={(e) => setBatchTopicName(e.target.value)}
                    placeholder="例：机器学习基础"
                    className="alc-textarea py-3 text-sm"
                    maxLength={50}
                  />
                </div>

                <div className="space-y-2">
                  <label className="alc-label uppercase tracking-wider">主题词（每行一个）</label>
                  <textarea
                    value={batchSources}
                    onChange={(e) => setBatchSources(e.target.value)}
                    placeholder={'注意力机制\n梯度下降\nRAG 检索增强生成'}
                    className="alc-textarea h-40 text-sm"
                    maxLength={1200}
                  />
                  <p className="alc-muted text-xs">
                    已识别 {batchItems.length} 个主题；每项需 5-50 字。
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="alc-label uppercase tracking-wider">统一约束（可选）</label>
                  <textarea
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="例：面向工程师，侧重实践；或：覆盖原理和常见误区..."
                    className="alc-textarea h-24 text-sm"
                    maxLength={200}
                  />
                </div>
              </div>

              <button
                onClick={() => void handleTopicExpandCompile()}
                disabled={!isBatchValid || submitting}
                className="alc-button-primary w-full py-3 text-sm"
              >
                {!config ? '配置 LLM 后开始' : submitting ? '准备中...' : '开始批量扩充'}
              </button>
            </>
          )}

          {!config && (
            <p className="text-warning text-xs text-center">需要先配置 LLM 供应商才能编译</p>
          )}
        </div>
      </div>
    </main>
  )
}
