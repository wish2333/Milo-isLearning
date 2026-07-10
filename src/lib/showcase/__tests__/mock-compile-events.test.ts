import { describe, it, expect } from 'vitest'
import { generateMockCompileEvents, getMockCompileTotalDuration } from '../mock-compile-events'

describe('mock-compile-events', () => {
  it('generates 16 events for 8 stages (stage_enter + progress each)', () => {
    const events = generateMockCompileEvents()
    expect(events).toHaveLength(16)
  })

  it('first event has delay 0', () => {
    const events = generateMockCompileEvents()
    expect(events[0]!.delay).toBe(0)
  })

  it('first event is stage_enter for import', () => {
    const events = generateMockCompileEvents()
    expect(events[0]!.event.kind).toBe('stage_enter')
  })

  it('events alternate stage_enter and progress', () => {
    const events = generateMockCompileEvents()
    for (let i = 0; i < events.length; i += 2) {
      expect(events[i]!.event.kind).toBe('stage_enter')
      expect(events[i + 1]!.event.kind).toBe('progress')
    }
  })

  it('feynman stage progress reaches 100%', () => {
    const events = generateMockCompileEvents()
    const lastProgress = events[events.length - 1]!
    expect(lastProgress.event.kind).toBe('progress')
    if (lastProgress.event.kind === 'progress') {
      expect(lastProgress.event.percent).toBe(100)
    }
  })

  it('all 8 stages are covered', () => {
    const events = generateMockCompileEvents()
    const stageEnters = events.filter((e) => e.event.kind === 'stage_enter')
    const stages = stageEnters.map((e) => (e.event.kind === 'stage_enter' ? e.event.stage : null))
    expect(stages).toEqual([
      'import',
      'chunk',
      'concept',
      'module',
      'mission',
      'quiz',
      'challenge',
      'feynman',
    ])
  })

  it('getMockCompileTotalDuration returns positive value', () => {
    const duration = getMockCompileTotalDuration()
    expect(duration).toBeGreaterThan(0)
    // 8 stages × (0 + 750) = 6000ms minimum
    expect(duration).toBeGreaterThanOrEqual(6000)
  })
})
