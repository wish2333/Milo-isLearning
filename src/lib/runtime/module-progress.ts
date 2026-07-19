import type { AttemptRecord, Module, ProgressState, ModuleStage } from '@/types/domain'

export interface ModuleProgressInfo {
  /** 已完全完成的 concept 数（不含当前正在做的） */
  completedConcepts: number
  /** 当前正在做的 concept 索引（0-based，-1 表示未开始或已完成） */
  currentConceptIndex: number
  /** 整体 concept 完成百分比（0–100，整数） */
  conceptPercent: number
  /** 简短文案，用于 UI 展示 */
  label: string
  /** 是否已完成（stage.kind === 'done'） */
  done: boolean
  /** 是否已开始（stage !== null 且 !== 'module_intro'） */
  started: boolean
  /** 已经产生作答记录的 quiz 槽位数；未传 attemptsBySlot 时省略。 */
  answeredQuizCount?: number
}

/**
 * 计算 module 的展示用进度（纯函数，V2.0.1 fix-report §5.5.2）。
 *
 * 进度语义（锁定）：
 *   - stage = null / 'module_intro' → started=false, completedConcepts=0, percent=0, label='未开始'
 *   - stage = 'concept_intro'(i) → completedConcepts=i, percent=round((i+0.5)/total*100)
 *   - stage = 'concept'(i, q) → completedConcepts=i, percent=round((i+0.5)/total*100)
 *   - stage = 'challenge' / 'feynman_intro' / 'feynman_step' / 'feynman_final'
 *     → completedConcepts=total, percent=95
 *   - stage = 'done' → completedConcepts=total, percent=100, label='已完成'
 *
 * 注意：本函数不计算"已答题数"，因为 quizIndex 可能落在 reviewSlot 上（§5.5.1）。
 */
export function computeModuleProgress(
  module: Module,
  progress: ProgressState | null,
  attemptsBySlot?: Record<string, AttemptRecord[]>,
): ModuleProgressInfo {
  const total = module.concepts.length

  const withAttemptInfo = (info: ModuleProgressInfo): ModuleProgressInfo => {
    if (!attemptsBySlot) return info
    const slotIds = [
      ...module.concepts.flatMap((concept) => concept.quizSeries.quizzes.map((quiz) => quiz.id)),
      ...(module.challengeQuizzes?.map((quiz) => quiz.id) ?? []),
    ]
    const answeredQuizCount = new Set(
      slotIds.filter((slotId) => (attemptsBySlot[slotId]?.length ?? 0) > 0),
    ).size
    return {
      ...info,
      answeredQuizCount,
      label: `${info.label} · 已答 ${answeredQuizCount} 题`,
    }
  }

  if (!progress || !progress.stage) {
    return withAttemptInfo({
      completedConcepts: 0,
      currentConceptIndex: -1,
      conceptPercent: 0,
      label: '未开始',
      done: false,
      started: false,
    })
  }

  const stage: ModuleStage = progress.stage

  if (stage.kind === 'done') {
    return withAttemptInfo({
      completedConcepts: total,
      currentConceptIndex: -1,
      conceptPercent: 100,
      label: '已完成',
      done: true,
      started: true,
    })
  }

  if (stage.kind === 'module_intro') {
    return withAttemptInfo({
      completedConcepts: 0,
      currentConceptIndex: -1,
      conceptPercent: 0,
      label: '未开始',
      done: false,
      started: false,
    })
  }

  if (stage.kind === 'concept_intro' || stage.kind === 'concept') {
    const i = stage.conceptIndex
    const pct = total > 0 ? Math.round(((i + 0.5) / total) * 100) : 0
    return withAttemptInfo({
      completedConcepts: i,
      currentConceptIndex: i,
      conceptPercent: Math.min(pct, 99),
      label: `概念 ${i + 1}/${total}`,
      done: false,
      started: true,
    })
  }

  return withAttemptInfo({
    completedConcepts: total,
    currentConceptIndex: -1,
    conceptPercent: 95,
    label: '最后阶段',
    done: false,
    started: true,
  })
}
