'use client'

import type { ReactNode } from 'react'

interface QuizActionBarProps {
  children: ReactNode
}

/**
 * 作答流程的统一底部操作区。
 *
 * 解析内容可能显著增加页面高度；固定操作区让“提交/下一题”始终在
 * 触手可及的位置，同时用 safe-area inset 兼容 iOS 底部手势区。
 */
export function QuizActionBar({ children }: QuizActionBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-bg-base/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  )
}
