'use client'

import { useEffect, useState, useCallback } from 'react'

import {
  scanLegacyLocalStorage,
  shouldShowMigrationPrompt,
  isMigrated,
  type ScanResult,
} from '@/lib/persistence/client/legacy-local-storage-scanner'
import {
  runMigration,
  dismissMigration,
  MigrationCancelledError,
  type MigrationProgress as ProgressState,
} from '@/lib/persistence/migration'

import { MigrationPrompt } from './MigrationPrompt'
import { MigrationDetail } from './MigrationDetail'
import { MigrationProgress } from './MigrationProgress'
import { MigrationResult } from './MigrationResult'

/**
 * MigrationOrchestrator -- 迁移流程状态机
 *
 * 状态：idle -> prompt -> detail -> progress -> result -> hidden
 */

type OrchestratorState =
  | { kind: 'idle' }
  | { kind: 'prompt'; scan: ScanResult }
  | { kind: 'detail'; scan: ScanResult }
  | { kind: 'progress'; progress: ProgressState; scan: ScanResult }
  | {
      kind: 'result'
      result: {
        committed: number
        skipped: number
        durationMs: number
        error: string | null
      }
    }
  | { kind: 'hidden' }

export interface MigrationOrchestratorProps {
  enabled: boolean
  onMigrationComplete: () => void
}

export function MigrationOrchestrator(props: MigrationOrchestratorProps) {
  const [state, setState] = useState<OrchestratorState>({ kind: 'idle' })
  const [cancelRequested, setCancelRequested] = useState(false)

  // 启动时扫描
  useEffect(() => {
    if (!props.enabled) {
      setState({ kind: 'hidden' })
      return
    }
    if (isMigrated()) {
      setState({ kind: 'hidden' })
      return
    }
    // scanLegacyLocalStorage 是 async（crypto.subtle）
    void scanLegacyLocalStorage().then((scan) => {
      if (scan.entries.length === 0) {
        setState({ kind: 'hidden' })
        return
      }
      if (!shouldShowMigrationPrompt(scan)) {
        setState({ kind: 'hidden' })
        return
      }
      setState({ kind: 'prompt', scan })
    })
  }, [props.enabled])

  const handleMigrate = useCallback(() => {
    setState((prev) => {
      if (prev.kind !== 'prompt') return prev
      return { kind: 'detail', scan: prev.scan }
    })
  }, [])

  const handleStart = useCallback(
    (args: { includeShowcase: boolean }) => {
      setState((prev) => {
        if (prev.kind !== 'detail') return prev
        const initialProgress: ProgressState = { phase: 'scan' }
        void runMigration({
          includeShowcase: args.includeShowcase,
          onProgress: (p) => {
            setState((curr) => {
              if (curr.kind !== 'progress') return curr
              if (p.phase === 'done' || p.phase === 'error') {
                return {
                  kind: 'result',
                  result:
                    p.phase === 'done'
                      ? {
                          committed: p.committed,
                          skipped: p.skipped,
                          durationMs: p.durationMs,
                          error: null,
                        }
                      : {
                          committed: 0,
                          skipped: 0,
                          durationMs: 0,
                          error: p.message,
                        },
                }
              }
              return { kind: 'progress', progress: p, scan: curr.scan }
            })
          },
          shouldCancel: () => cancelRequested,
        }).catch((err: unknown) => {
          if (err instanceof MigrationCancelledError) {
            setState({
              kind: 'result',
              result: {
                committed: 0,
                skipped: 0,
                durationMs: 0,
                error: '用户取消迁移',
              },
            })
          } else {
            setState({
              kind: 'result',
              result: {
                committed: 0,
                skipped: 0,
                durationMs: 0,
                error: err instanceof Error ? err.message : String(err),
              },
            })
          }
        })
        return { kind: 'progress', progress: initialProgress, scan: prev.scan }
      })
    },
    [cancelRequested],
  )

  const handleCancelProgress = useCallback(() => {
    setCancelRequested(true)
  }, [])

  const handleDismiss = useCallback(() => {
    dismissMigration()
    setState({ kind: 'hidden' })
  }, [])

  const handleCloseResult = useCallback(() => {
    setState((curr) => {
      if (curr.kind !== 'result') return curr
      if (curr.result.error === null) {
        props.onMigrationComplete()
      }
      return { kind: 'hidden' }
    })
  }, [props])

  // ----- 渲染 -----

  if (state.kind === 'idle' || state.kind === 'hidden') return null

  if (state.kind === 'prompt') {
    return (
      <MigrationPrompt
        moduleCount={state.scan.moduleIds.length}
        totalBytes={state.scan.entries.reduce(
          (sum, e) => sum + e.key.length + e.valueRaw.length,
          0,
        )}
        onMigrate={handleMigrate}
        onViewDetail={handleMigrate}
        onDismiss={handleDismiss}
      />
    )
  }

  if (state.kind === 'detail') {
    const showcaseCount = state.scan.entries.filter((e) => {
      if (!e.key.startsWith('alc:module:')) return false
      try {
        return (JSON.parse(e.valueRaw) as { origin?: string }).origin === 'showcase'
      } catch {
        return false
      }
    }).length

    return (
      <MigrationDetail
        moduleCount={state.scan.moduleIds.length}
        totalBytes={state.scan.entries.reduce(
          (sum, e) => sum + e.key.length + e.valueRaw.length,
          0,
        )}
        moduleIds={state.scan.moduleIds}
        showcaseModuleCount={showcaseCount}
        onStart={handleStart}
        onCancel={handleDismiss}
      />
    )
  }

  if (state.kind === 'progress') {
    return <MigrationProgress progress={state.progress} onCancel={handleCancelProgress} />
  }

  if (state.kind === 'result') {
    return (
      <MigrationResult
        committed={state.result.committed}
        skipped={state.result.skipped}
        durationMs={state.result.durationMs}
        error={state.result.error}
        onClose={handleCloseResult}
      />
    )
  }

  return null
}
