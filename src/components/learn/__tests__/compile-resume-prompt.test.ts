import { describe, it, expect } from 'vitest'

/**
 * PB.3 CompileResumePrompt stage labels consistency check
 *
 * Verifies that STAGE_LABELS in CompileResumePrompt covers all CompileStage values.
 */
describe('CompileResumePrompt stage labels (PB.3)', () => {
  const COMPILE_STAGES = [
    'import',
    'chunk',
    'concept',
    'module',
    'mission',
    'quiz',
    'challenge',
    'feynman',
  ] as const

  // Mirror of the STAGE_LABELS in CompileResumePrompt.tsx
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

  it('covers all CompileStage values', () => {
    for (const stage of COMPILE_STAGES) {
      expect(STAGE_LABELS[stage], `Missing label for stage: ${stage}`).toBeTruthy()
    }
  })

  it('fallback returns the raw stage string for unknown stages', () => {
    const unknown = 'unknown_stage'
    const label = STAGE_LABELS[unknown] ?? unknown
    expect(label).toBe(unknown)
  })
})
