'use client'

/**
 * ConfirmInline -- inline two-step confirmation component.
 *
 * State 0: renders `trigger` as a button.
 * State 1: replaces trigger with `[confirmLabel] [confirm] [cancel]`.
 * Escape in State 1 cancels.
 *
 * Visual: light-touch inline UI matching FeedbackPanel's guessed-marking aesthetic
 * (text-xs, text-fg-tertiary hover:text-fg-secondary, no heavy borders).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface ConfirmInlineProps {
  /** The initiating button/element (rendered as a button wrapper) */
  trigger: React.ReactNode
  /** Prompt text shown in State 1, e.g. "确认修正答案？" */
  confirmLabel: string
  onConfirm: () => void
  onCancel?: () => void
  /** true = confirm button uses danger tokens */
  destructive?: boolean
  /** Pass-through classes for the trigger button */
  triggerClassName?: string
}

export function ConfirmInline({
  trigger,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
  triggerClassName,
}: ConfirmInlineProps) {
  const [pending, setPending] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const reset = useCallback(
    (confirmed: boolean) => {
      if (confirmed) {
        onConfirm()
      } else {
        onCancel?.()
      }
      setPending(false)
    },
    [onConfirm, onCancel],
  )

  // Escape key cancels in State 1
  useEffect(() => {
    if (!pending) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        reset(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pending, reset])

  if (!pending) {
    return (
      <button
        type="button"
        onClick={() => setPending(true)}
        className={
          triggerClassName ?? 'text-xs text-fg-tertiary hover:text-fg-secondary transition-colors'
        }
        aria-label="确认操作"
      >
        {trigger}
      </button>
    )
  }

  const confirmBtnClass = destructive
    ? 'text-xs text-fg-tertiary hover:text-danger transition-colors'
    : 'text-xs text-fg-tertiary hover:text-accent-primary transition-colors'

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={confirmLabel}
      className="flex items-center gap-3 flex-wrap"
    >
      <span className="text-xs text-fg-tertiary">{confirmLabel}</span>
      <button
        type="button"
        onClick={() => reset(true)}
        className={confirmBtnClass}
        aria-label={destructive ? '确认删除' : '确认'}
      >
        确认
      </button>
      <button
        type="button"
        onClick={() => reset(false)}
        className="text-xs text-fg-quaternary hover:text-fg-tertiary transition-colors"
        aria-label="取消"
      >
        取消
      </button>
    </div>
  )
}
