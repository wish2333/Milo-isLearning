/**
 * createAutoFixQuizBatch factory unit tests
 *
 * Covers:
 *   - distractor.text === answer fix + counter increment
 *   - short extendedKnowledge fix + counter increment
 *   - short misconception fix + counter increment
 *   - no-fix needed returns null + counters stay zero
 *   - multiple fixes in single batch
 */

import { describe, expect, it } from 'vitest'
import type { ZodIssue } from 'zod'
import { createAutoFixQuizBatch } from '@/lib/compiler/pipeline/pipeline'

const emptyIssues: ZodIssue[] = []

describe('createAutoFixQuizBatch', () => {
  it('returns null when no fixes needed and all counters stay zero', () => {
    const factory = createAutoFixQuizBatch()
    const value = {
      quizzes: [
        {
          answer: 'A',
          distractors: [{ text: 'B', used: false }],
          extendedKnowledge: 'This is a valid extended knowledge string',
          misconception: 'This is valid',
        },
      ],
    }

    const result = factory.autoFix(value, emptyIssues)

    expect(result).toBeNull()
    expect(factory.stats.duplicateOptionsRemoved).toBe(0)
    expect(factory.stats.shortExtendedKnowledgeFallback).toBe(0)
    expect(factory.stats.shortMisconceptionFallback).toBe(0)
  })

  it('fixes distractor.text === answer and increments counter', () => {
    const factory = createAutoFixQuizBatch()
    const value = {
      quizzes: [
        {
          answer: 'correct',
          distractors: [
            { text: 'wrong1', used: true },
            { text: 'correct', used: true },
            { text: 'wrong2', used: false },
          ],
        },
      ],
    }

    const result = factory.autoFix(value, emptyIssues)

    expect(result).not.toBeNull()
    expect(factory.stats.duplicateOptionsRemoved).toBe(1)
    expect(factory.stats.shortExtendedKnowledgeFallback).toBe(0)
    expect(factory.stats.shortMisconceptionFallback).toBe(0)
  })

  it('deletes short extendedKnowledge and increments counter', () => {
    const factory = createAutoFixQuizBatch()
    const value = {
      quizzes: [
        {
          answer: 'A',
          distractors: [],
          extendedKnowledge: 'too short',
        },
      ],
    }

    const result = factory.autoFix(value, emptyIssues)

    expect(result).not.toBeNull()
    const quizzes = (result as Record<string, unknown>).quizzes as Array<Record<string, unknown>>
    expect(quizzes[0]).not.toHaveProperty('extendedKnowledge')
    expect(factory.stats.shortExtendedKnowledgeFallback).toBe(1)
  })

  it('deletes short misconception and increments counter', () => {
    const factory = createAutoFixQuizBatch()
    const value = {
      quizzes: [
        {
          answer: 'A',
          distractors: [],
          misconception: 'short',
        },
      ],
    }

    const result = factory.autoFix(value, emptyIssues)

    expect(result).not.toBeNull()
    const quizzes = (result as Record<string, unknown>).quizzes as Array<Record<string, unknown>>
    expect(quizzes[0]).not.toHaveProperty('misconception')
    expect(factory.stats.shortMisconceptionFallback).toBe(1)
  })

  it('counts multiple fix types across quizzes in single batch', () => {
    const factory = createAutoFixQuizBatch()
    const value = {
      quizzes: [
        {
          answer: 'X',
          distractors: [
            { text: 'X', used: true },
            { text: 'Y', used: false },
          ],
          misconception: 'tiny',
        },
        {
          answer: 'A',
          distractors: [],
          extendedKnowledge: 'too short ext',
        },
      ],
    }

    const result = factory.autoFix(value, emptyIssues)

    expect(result).not.toBeNull()
    expect(factory.stats.duplicateOptionsRemoved).toBe(1)
    expect(factory.stats.shortExtendedKnowledgeFallback).toBe(1)
    expect(factory.stats.shortMisconceptionFallback).toBe(1)
  })

  it('counts duplicate options across multiple quizzes', () => {
    const factory = createAutoFixQuizBatch()
    const value = {
      quizzes: [
        {
          answer: 'A',
          distractors: [{ text: 'A', used: true }],
        },
        {
          answer: 'B',
          distractors: [
            { text: 'B', used: true },
            { text: 'B', used: true },
          ],
        },
      ],
    }

    const result = factory.autoFix(value, emptyIssues)

    expect(result).not.toBeNull()
    expect(factory.stats.duplicateOptionsRemoved).toBe(3)
  })

  it('returns null when value is not an object', () => {
    const factory = createAutoFixQuizBatch()
    expect(factory.autoFix(null, emptyIssues)).toBeNull()
    expect(factory.autoFix('string', emptyIssues)).toBeNull()
    expect(factory.autoFix(42, emptyIssues)).toBeNull()
    expect(factory.stats.duplicateOptionsRemoved).toBe(0)
  })

  it('returns null when value has no quizzes array', () => {
    const factory = createAutoFixQuizBatch()
    expect(factory.autoFix({ foo: 'bar' }, emptyIssues)).toBeNull()
    expect(factory.autoFix({ quizzes: 'not-array' }, emptyIssues)).toBeNull()
  })

  it('does not flag distractor with text === answer but used !== true', () => {
    const factory = createAutoFixQuizBatch()
    const value = {
      quizzes: [
        {
          answer: 'A',
          distractors: [{ text: 'A', used: false }],
        },
      ],
    }

    const result = factory.autoFix(value, emptyIssues)
    expect(result).toBeNull()
    expect(factory.stats.duplicateOptionsRemoved).toBe(0)
  })
})
