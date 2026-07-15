import type { CompileEvent, CompileStage } from '@/lib/compiler/pipeline/types'

/**
 * 8 个编译阶段的中文标签（与 compiling/page.tsx STAGE_LABELS 一致）。
 */
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

/**
 * 每阶段的展示时长（毫秒）。总时长约 12s（8 × 1.5s）。
 */
const STAGE_DURATION_MS = 1500

/**
 * 带时延的事件（用于 setTimeout 链式播放）。
 */
export interface TimedEvent {
  event: CompileEvent
  /** 距上一个事件的延迟（ms） */
  delay: number
}

const STAGES: CompileStage[] = [
  'import',
  'chunk',
  'concept',
  'module',
  'mission',
  'quiz',
  'challenge',
  'feynman',
]

const STAGE_PERCENTS: Record<CompileStage, number> = {
  import: 25,
  chunk: 40,
  concept: 55,
  module: 65,
  mission: 70,
  quiz: 88,
  challenge: 96,
  feynman: 100,
}

/**
 * 生成 8 阶段的合成 CompileEvent 序列（不含 complete 事件）。
 *
 * 每个 stage 产生：
 *   1. { kind: 'stage_enter', stage }
 *   2. { kind: 'progress', stage, percent, message }
 */
export function generateMockCompileEvents(): TimedEvent[] {
  const events: TimedEvent[] = []

  for (const stage of STAGES) {
    events.push({
      event: { kind: 'stage_enter', stage },
      delay: 0,
    })
    events.push({
      event: {
        kind: 'progress',
        stage,
        percent: STAGE_PERCENTS[stage],
        message: STAGE_LABELS[stage],
      },
      delay: STAGE_DURATION_MS / 2,
    })
  }
  return events
}

/**
 * 获取模拟编译总时长（ms），用于 onComplete 回调的预估。
 */
export function getMockCompileTotalDuration(): number {
  const events = generateMockCompileEvents()
  return events.reduce((sum, e) => sum + e.delay, 0)
}

// =================================================================
// Recording replay support (PC.3)
// =================================================================

/**
 * CompileRecording -- the JSON schema written by scripts/record-compile.ts.
 */
export interface CompileRecording {
  input: { markdown: string; config: unknown }
  events: Array<{ event: CompileEvent; delayMs: number }>
  recordedAt: number
  provider: string
  model: string
}

/**
 * Load a recorded compile session from a JSON file and return TimedEvent[]
 * for replay via MockCompileOverlay.
 *
 * Fetches the recording from the given public/ path (e.g. /showcase-modules/recordings/my-topic.compile-recording.json).
 * Returns null if the fetch fails (404, network error, or invalid JSON).
 */
export async function loadRecordedEvents(recordingPath: string): Promise<TimedEvent[] | null> {
  try {
    const res = await fetch(recordingPath)
    if (!res.ok) return null
    const recording: CompileRecording = await res.json()
    return recording.events.map((e) => ({ event: e.event, delay: e.delayMs }))
  } catch {
    return null
  }
}
