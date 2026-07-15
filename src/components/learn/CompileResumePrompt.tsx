'use client'

/**
 * CompileResumePrompt -- 检测到未完成编译时的恢复提示 (PB.3 F04)
 *
 * 仅 production 模式显示（showcase 模式 mock 编译无中断）。
 * "继续编译" -> 路由到编译页（带 resumeFrom 参数）
 * "重新开始" -> 放弃 session 后走正常编译流程
 */

import type { CompileStage } from '@/lib/compiler/pipeline/types'

const STAGE_LABELS: Record<string, string> = {
  import: '正在清理文本',
  chunk: '正在切分知识块',
  concept: '正在提取核心概念',
  module: '正在构建学习模块',
  mission: '正在规划练习序列',
  quiz: '正在生成练习题',
  challenge: '正在生成综合挑战题',
  feynman: '正在设计费曼任务',
}

interface CompileResumePromptProps {
  sessionId: string
  lastStage: CompileStage | null
  onResume: () => void
  onRestart: () => void
}

export function CompileResumePrompt({
  sessionId: _sessionId,
  lastStage,
  onResume,
  onRestart,
}: CompileResumePromptProps) {
  const stageLabel = lastStage ? (STAGE_LABELS[lastStage] ?? lastStage) : '未知阶段'

  return (
    <div className="alc-card p-4 space-y-3">
      <p className="text-sm text-fg-primary">检测到未完成的编译（stage: {stageLabel}）</p>
      <p className="text-xs text-fg-secondary">
        是否继续上次的编译进度？重新开始将丢弃已有的编译结果。
      </p>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onResume} className="alc-button-primary flex-1 text-sm">
          继续编译
        </button>
        <button type="button" onClick={onRestart} className="alc-button-secondary flex-1 text-sm">
          重新开始
        </button>
      </div>
    </div>
  )
}
