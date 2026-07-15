'use client'

import { useEffect, useRef } from 'react'
import { useCompileStore } from '@/lib/state/compile-store'
import {
  generateMockCompileEvents,
  loadRecordedEvents,
  type TimedEvent,
} from '@/lib/showcase/mock-compile-events'

/** 编译阶段中文文案 -- 与 compiling/page.tsx 保持一致 */
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

/** Default recording path used when no explicit recording is available */
const DEFAULT_RECORDING_PATH = '/showcase-modules/recordings/featured.compile-recording.json'

interface Props {
  onComplete: () => void
  onError: (message: string) => void
  /** Optional recording path; falls back to DEFAULT_RECORDING_PATH then generateMockCompileEvents() */
  recordingPath?: string
}

export function MockCompileOverlay({ onComplete, onError, recordingPath }: Props) {
  const stage = useCompileStore((s) => s.stage)
  const percent = useCompileStore((s) => s.percent)
  const message = useCompileStore((s) => s.message)
  const timerIdsRef = useRef<number[]>([])
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)

  onCompleteRef.current = onComplete
  onErrorRef.current = onError

  useEffect(() => {
    const handleEvent = useCompileStore.getState().handleEvent
    const reset = useCompileStore.getState().reset

    // Start clean
    reset()

    const resolvedPath = recordingPath ?? DEFAULT_RECORDING_PATH
    let cancelled = false

    const scheduleEvents = (events: TimedEvent[]) => {
      if (cancelled) return

      let cumulativeDelay = 0

      for (const { event, delay } of events) {
        cumulativeDelay += delay
        const timerId = window.setTimeout(() => {
          try {
            handleEvent(event)
          } catch {
            // Mock compile should never error via handleEvent, but guard anyway
          }
        }, cumulativeDelay)
        timerIdsRef.current.push(timerId)
      }

      // Schedule onComplete after all events with a small buffer
      const completeTimerId = window.setTimeout(() => {
        onCompleteRef.current()
      }, cumulativeDelay + 500)
      timerIdsRef.current.push(completeTimerId)
    }

    // Try to load recorded events first, fall back to generated mock events
    loadRecordedEvents(resolvedPath).then((recorded) => {
      if (cancelled) return
      if (recorded && recorded.length > 0) {
        scheduleEvents(recorded)
      } else {
        scheduleEvents(generateMockCompileEvents())
      }
    })

    return () => {
      cancelled = true
      for (const id of timerIdsRef.current) {
        clearTimeout(id)
      }
      timerIdsRef.current = []
    }
  }, [recordingPath])

  const stageLabel = stage ? (STAGE_LABELS[stage] ?? stage) : '准备中...'

  return (
    <main className="min-h-screen bg-bg-base text-fg-primary flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        {/* Spinner / Progress — matching compiling/page.tsx style */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 relative">
            <svg className="animate-spin-slow w-full h-full" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-fg-quaternary"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${(percent / 100) * 176} 176`}
                strokeLinecap="round"
                className="text-fg-secondary transition-all duration-500"
                transform="rotate(-90 32 32)"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs text-fg-secondary">
              {percent}%
            </span>
          </div>

          <div className="text-center space-y-1">
            <p className="text-sm text-fg-secondary">{stageLabel}</p>
            {message && <p className="text-xs text-fg-tertiary">{message}</p>}
          </div>
        </div>

        {/* Stage list — matching compiling/page.tsx */}
        <div className="space-y-1">
          {Object.entries(STAGE_LABELS).map(([key, label]) => {
            const isActive = stage === key
            const isPast =
              stage &&
              Object.keys(STAGE_LABELS).indexOf(stage) > Object.keys(STAGE_LABELS).indexOf(key)
            return (
              <div
                key={key}
                className={`flex items-center gap-2 text-xs py-1 ${
                  isActive ? 'text-fg-primary' : isPast ? 'text-fg-tertiary' : 'text-fg-quaternary'
                }`}
              >
                <span
                  className={`w-1 h-1 rounded-full ${
                    isActive
                      ? 'bg-accent-primary'
                      : isPast
                        ? 'bg-state-completed'
                        : 'bg-bg-elevated'
                  }`}
                />
                {label}
              </div>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        @keyframes spin-slow {
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </main>
  )
}
