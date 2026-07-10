'use client'

import { useEffect } from 'react'
import Link from 'next/link'

import { track } from '@/lib/runtime/analytics'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    const stackHash = error.stack ? error.stack.split('\n')[0]?.slice(0, 60) : error.name
    track('error_boundary', {
      errorName: error.name,
      stackHash: stackHash ?? 'unknown',
    })
  }, [error])

  return (
    <div className="alc-page items-center justify-center">
      <div className="max-w-md text-center space-y-6 px-6">
        <div className="space-y-2">
          <h2 className="text-xl text-fg-primary">出了点问题</h2>
          <p className="text-sm text-fg-tertiary leading-relaxed">
            页面遇到了意外错误。你可以尝试重新加载，或者返回首页继续。
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="alc-button-primary px-5 py-2.5 text-sm">
            重试
          </button>
          <Link href="/" className="alc-button-secondary px-5 py-2.5 text-sm">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  )
}
