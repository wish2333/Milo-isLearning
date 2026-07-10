'use client'

interface ReviewQueueIndicatorProps {
  count: number
}

export function ReviewQueueIndicator({ count }: ReviewQueueIndicatorProps) {
  if (count === 0) return null
  return <p className="text-xs text-fg-quaternary">本概念结束后还有 {count} 道复习题</p>
}
