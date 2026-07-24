/**
 * collectCrossModuleReviewSlots 单测。
 *
 * 独立文件原因：需要 vi.mock schedule-library（控制 due 排序）与 settings-store
 * （matchesFilter 的 'due' 分支会读 fsrs.enabled）。放独立文件避免污染既有
 * adaptive-sequencer.test.ts 的无 mock 环境。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AttemptRecord, Module, Quiz, SchedulingData } from '@/types/domain'

// vi.mock 会被提升到文件顶部（早于 import），故先声明。
vi.mock('@/lib/persistence/schedule-library', () => ({
  scheduleLibrary: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    listByModule: vi.fn(() => []),
    listDueBefore: vi.fn(() => []),
    listAll: vi.fn(() => []),
    clearAll: vi.fn(),
  },
}))

// matchesFilter('due') 内部会读 useSettingsStore.getState().fsrs?.enabled；
// 统一 mock 为可配置，默认 fsrs.enabled=true 以支持 due 路径。
const mockSettingsState = { fsrs: { enabled: true } }
vi.mock('@/lib/state/settings-store', () => ({
  useSettingsStore: {
    getState: () => mockSettingsState,
    subscribe: () => () => {},
  },
}))

import { scheduleLibrary } from '@/lib/persistence/schedule-library'

import { collectCrossModuleReviewSlots } from '../adaptive-sequencer'

function makeQuiz(id: string, opts: { ignored?: boolean } = {}): Quiz {
  return {
    id,
    conceptId: 'c',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: `Q: ${id}`,
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: 'A',
    distractors: ['B'],
    ...(opts.ignored ? { ignored: true } : {}),
  }
}

function makeModule(moduleId: string, quizzes: Quiz[]): Module {
  return {
    id: moduleId,
    sourceId: `src-${moduleId}`,
    title: moduleId,
    intro: 'i',
    goal: 'g',
    concepts: [
      {
        id: `${moduleId}-c0`,
        moduleId,
        name: 'C',
        definition: 'd',
        type: 'fact',
        keyPoints: [],
        quizSeries: { conceptId: `${moduleId}-c0`, quizzes },
        order: 0,
      },
    ],
    feynmanTask: { moduleId, steps: [], finalPrompt: 'p', rubric: ['g'] },
    order: 1,
  }
}

function wrongAttempt(slotId: string, timestamp: number): AttemptRecord {
  return {
    id: `att-${slotId}-${timestamp}`,
    quizId: slotId,
    originalQuizId: slotId,
    attemptVersion: 0,
    userAnswer: 'B',
    score: 30,
    gaps: ['gap'],
    nextAction: 'retry',
    timestamp,
  }
}

function makeSchedule(slotId: string, dueISO: string): SchedulingData {
  return {
    slotId,
    moduleId: 'm',
    conceptId: 'c',
    stability: 1,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    state: 'review',
    due: dueISO,
    last_review: null,
    schemaVersion: 2,
    contentRevision: 'r',
    configRevision: 'r',
    lastAppliedAttemptId: 'a',
  }
}

const NOW = new Date('2026-07-24T12:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('collectCrossModuleReviewSlots', () => {
  it('(a) FSRS 开启 + due 题 → 按 due 升序截断', () => {
    mockSettingsState.fsrs.enabled = true
    // 三个其他模块的 due slot（due 越早越紧迫 → 升序在前）
    const dueMap: Record<string, SchedulingData> = {
      'm2:s0': makeSchedule('m2:s0', '2026-07-23T08:00:00Z'), // 最紧迫
      'm2:s1': makeSchedule('m2:s1', '2026-07-20T00:00:00Z'), // 更早
      'm3:s0': makeSchedule('m3:s0', '2026-07-24T10:00:00Z'), // 较晚
    }
    vi.mocked(scheduleLibrary.get).mockImplementation((slotId) => dueMap[slotId] ?? null)

    const modules = [
      makeModule('m1', [makeQuiz('m1:s0')]),
      makeModule('m2', [makeQuiz('m2:s0'), makeQuiz('m2:s1')]),
      makeModule('m3', [makeQuiz('m3:s0')]),
    ]
    const attempts: Record<string, AttemptRecord[]> = {
      'm2:s0': [wrongAttempt('m2:s0', 1)],
      'm2:s1': [wrongAttempt('m2:s1', 1)],
      'm3:s0': [wrongAttempt('m3:s0', 1)],
    }
    const result = collectCrossModuleReviewSlots(modules, 'm1', attempts, {
      fsrsEnabled: true,
      now: NOW,
      cap: 5,
    })
    // 升序：m2:s1(07-20) → m2:s0(07-23) → m3:s0(07-24)
    expect(result).toEqual(['m2:s1', 'm2:s0', 'm3:s0'])
  })

  it('(b) FSRS 关闭 + wrong 题 → 按最近答错时间降序', () => {
    mockSettingsState.fsrs.enabled = false
    const modules = [
      makeModule('m1', [makeQuiz('m1:s0')]),
      makeModule('m2', [makeQuiz('m2:s0'), makeQuiz('m2:s1'), makeQuiz('m2:s2')]),
    ]
    const attempts: Record<string, AttemptRecord[]> = {
      'm2:s0': [wrongAttempt('m2:s0', 100)], // 较早
      'm2:s1': [wrongAttempt('m2:s1', 300)], // 最近
      'm2:s2': [wrongAttempt('m2:s2', 200)],
    }
    const result = collectCrossModuleReviewSlots(modules, 'm1', attempts, {
      fsrsEnabled: false,
      now: NOW,
    })
    // 降序：s1(300) → s2(200) → s0(100)
    expect(result).toEqual(['m2:s1', 'm2:s2', 'm2:s0'])
  })

  it('(c) 排除 currentModuleId 的 slot', () => {
    mockSettingsState.fsrs.enabled = false
    const modules = [
      makeModule('m1', [makeQuiz('m1:s0'), makeQuiz('m1:s1')]),
      makeModule('m2', [makeQuiz('m2:s0')]),
    ]
    const attempts: Record<string, AttemptRecord[]> = {
      'm1:s0': [wrongAttempt('m1:s0', 1)], // 属于 currentModule，应排除
      'm2:s0': [wrongAttempt('m2:s0', 2)],
    }
    const result = collectCrossModuleReviewSlots(modules, 'm1', attempts, {
      fsrsEnabled: false,
      now: NOW,
    })
    expect(result).toEqual(['m2:s0'])
  })

  it('(d) cap 截断（cap=2，候选 3 个）', () => {
    mockSettingsState.fsrs.enabled = false
    const modules = [
      makeModule('m1', [makeQuiz('m1:s0')]),
      makeModule('m2', [makeQuiz('m2:s0'), makeQuiz('m2:s1'), makeQuiz('m2:s2')]),
    ]
    const attempts: Record<string, AttemptRecord[]> = {
      'm2:s0': [wrongAttempt('m2:s0', 10)],
      'm2:s1': [wrongAttempt('m2:s1', 30)],
      'm2:s2': [wrongAttempt('m2:s2', 20)],
    }
    const result = collectCrossModuleReviewSlots(modules, 'm1', attempts, {
      fsrsEnabled: false,
      now: NOW,
      cap: 2,
    })
    // 降序前 2：s1(30) → s2(20)
    expect(result).toEqual(['m2:s1', 'm2:s2'])
  })

  it('(e) 其他模块无 wrong/due → 返回空', () => {
    mockSettingsState.fsrs.enabled = false
    const modules = [
      makeModule('m1', [makeQuiz('m1:s0')]),
      makeModule('m2', [makeQuiz('m2:s0'), makeQuiz('m2:s1')]),
    ]
    // m2 的 slot 全部答对，无 wrong
    const correctAttempt = (slotId: string, ts: number): AttemptRecord => ({
      ...wrongAttempt(slotId, ts),
      score: 100,
      nextAction: 'advance',
      gaps: [],
    })
    const attempts: Record<string, AttemptRecord[]> = {
      'm2:s0': [correctAttempt('m2:s0', 1)],
      'm2:s1': [correctAttempt('m2:s1', 2)],
    }
    const result = collectCrossModuleReviewSlots(modules, 'm1', attempts, {
      fsrsEnabled: false,
      now: NOW,
    })
    expect(result).toEqual([])
  })

  it('(f) FSRS 关闭且无 wrong attempt → 空', () => {
    mockSettingsState.fsrs.enabled = false
    const modules = [makeModule('m1', [makeQuiz('m1:s0')]), makeModule('m2', [makeQuiz('m2:s0')])]
    // 完全没有 attempt 记录
    const result = collectCrossModuleReviewSlots(
      modules,
      'm1',
      {},
      {
        fsrsEnabled: false,
        now: NOW,
      },
    )
    expect(result).toEqual([])
  })

  it('(g) ignored quiz 被排除（matchesFilter 路径不回归）', () => {
    mockSettingsState.fsrs.enabled = false
    const modules = [
      makeModule('m1', [makeQuiz('m1:s0')]),
      makeModule('m2', [
        makeQuiz('m2:s0', { ignored: true }), // ignored，即使有 wrong attempt 也排除
        makeQuiz('m2:s1'),
      ]),
    ]
    const attempts: Record<string, AttemptRecord[]> = {
      'm2:s0': [wrongAttempt('m2:s0', 100)],
      'm2:s1': [wrongAttempt('m2:s1', 50)],
    }
    const result = collectCrossModuleReviewSlots(modules, 'm1', attempts, {
      fsrsEnabled: false,
      now: NOW,
    })
    expect(result).toEqual(['m2:s1'])
  })

  it('主题内仅 1 个模块（无其他模块）→ 返回空', () => {
    mockSettingsState.fsrs.enabled = false
    const modules = [makeModule('m1', [makeQuiz('m1:s0')])]
    const result = collectCrossModuleReviewSlots(
      modules,
      'm1',
      {},
      {
        fsrsEnabled: false,
        now: NOW,
      },
    )
    expect(result).toEqual([])
  })

  it('cap 默认值为 5', () => {
    mockSettingsState.fsrs.enabled = false
    // 7 个候选 wrong slot，默认 cap=5
    const quizzes = Array.from({ length: 7 }, (_, i) => makeQuiz(`m2:s${i}`))
    const modules = [makeModule('m1', [makeQuiz('m1:s0')]), makeModule('m2', quizzes)]
    const attempts: Record<string, AttemptRecord[]> = {}
    for (let i = 0; i < 7; i++) attempts[`m2:s${i}`] = [wrongAttempt(`m2:s${i}`, i)]
    const result = collectCrossModuleReviewSlots(modules, 'm1', attempts, {
      fsrsEnabled: false,
      now: NOW,
    })
    expect(result).toHaveLength(5)
  })
})
