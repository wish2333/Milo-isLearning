import { describe, expect, it } from 'vitest'

import type { StorageRepository } from '@/lib/persistence/shared/repository'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { loadStreak, localDateString, saveStreak, updateStreak } from './streak'

class MemoryRepository implements StorageRepository {
  private readonly values = new Map<string, string>()

  get<T>(key: string): T | null {
    const value = this.values.get(key)
    return value === undefined ? null : (JSON.parse(value) as T)
  }

  set<T>(key: string, value: T): void {
    this.values.set(key, JSON.stringify(value))
  }

  remove(key: string): void {
    this.values.delete(key)
  }

  has(key: string): boolean {
    return this.values.has(key)
  }

  keys(): string[] {
    return [...this.values.keys()]
  }

  getRaw(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setRaw(key: string, value: string): void {
    this.values.set(key, value)
  }

  clearAll(): void {
    this.values.clear()
  }
}

describe('updateStreak', () => {
  it('starts a new streak and counts the first study day', () => {
    expect(updateStreak(null, '2026-07-17')).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastStudyDate: '2026-07-17',
      totalStudyDays: 1,
    })
  })

  it('does not double count attempts on the same day', () => {
    const streak = updateStreak(null, '2026-07-17')
    expect(updateStreak(streak, '2026-07-17')).toEqual(streak)
  })

  it('continues from yesterday and updates longestStreak', () => {
    const streak = {
      currentStreak: 2,
      longestStreak: 2,
      lastStudyDate: '2026-07-16',
      totalStudyDays: 4,
    }
    expect(updateStreak(streak, '2026-07-17')).toEqual({
      currentStreak: 3,
      longestStreak: 3,
      lastStudyDate: '2026-07-17',
      totalStudyDays: 5,
    })
  })

  it('resets current streak after a gap but preserves the record', () => {
    const streak = {
      currentStreak: 5,
      longestStreak: 5,
      lastStudyDate: '2026-07-10',
      totalStudyDays: 8,
    }
    expect(updateStreak(streak, '2026-07-17')).toEqual({
      currentStreak: 1,
      longestStreak: 5,
      lastStudyDate: '2026-07-17',
      totalStudyDays: 9,
    })
  })
})

describe('streak persistence and local dates', () => {
  it('loads and saves through StorageRepository', () => {
    const repo = new MemoryRepository()
    const streak = updateStreak(null, '2026-07-17')
    saveStreak(streak, repo)
    expect(repo.has(StorageKeys.streak)).toBe(true)
    expect(loadStreak(repo)).toEqual(streak)
  })

  it('formats dates using the requested timezone around a UTC boundary', () => {
    const date = new Date('2026-07-17T00:30:00.000Z')
    expect(localDateString(date, 'Asia/Shanghai')).toBe('2026-07-17')
    expect(localDateString(date, 'America/Los_Angeles')).toBe('2026-07-16')
  })
})
