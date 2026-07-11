'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { listStoredModules } from '@/lib/persistence/module-library'
import { storage } from '@/lib/persistence/local-storage'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { useRuntimeMode } from '@/lib/state/runtime-mode-store'

/**
 * 首页（实用模式）— 引导用户进入学习流程
 */
export function ProductionHome() {
  const router = useRouter()
  const [buttonLabel, setButtonLabel] = useState('开始学习')
  const [targetHref, setTargetHref] = useState('/learn/import')

  useEffect(() => {
    const modules = listStoredModules(storage)
    if (modules.length === 0) return
    const recent = modules[0]!
    if (!recent.completed) {
      setButtonLabel('继续学习')
      setTargetHref(`/learn/module/${recent.id}`)
    } else {
      setButtonLabel('前往题库')
      setTargetHref('/learn/library')
    }
  }, [])

  const handleStart = () => router.push(targetHref)

  return (
    <main className="alc-page items-center justify-center p-8">
      <section className="w-full max-w-2xl space-y-8 text-center">
        <div className="space-y-3">
          <p className="alc-label uppercase tracking-wider">Learning path compiler</p>
          <h1 className="text-4xl font-semibold text-fg-primary">AI Learning Compiler</h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-fg-secondary">
            将任何知识编译成一条低摩擦、高掌握度的学习路径：先理解，再练习，最后讲清楚。
          </p>
        </div>

        <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
          <button onClick={handleStart} className="alc-button-primary text-sm">
            {buttonLabel}
          </button>
          <Link href="/settings" className="alc-button-secondary text-sm">
            设置
          </Link>
        </div>

        <div className="mx-auto grid max-w-xl grid-cols-3 gap-2 text-left">
          {['导入材料', '编译题库', '费曼解释'].map((label, index) => (
            <div key={label} className="alc-card p-3">
              <p className="alc-muted text-xs tabular-nums">0{index + 1}</p>
              <p className="mt-1 text-sm text-fg-primary">{label}</p>
            </div>
          ))}
        </div>

        {isShowcaseMode && (
          <div className="text-center pt-4">
            <button
              type="button"
              onClick={() => {
                useRuntimeMode.getState().exitStudio()
                router.push('/')
              }}
              className="alc-muted text-xs underline hover:text-fg-primary"
            >
              返回展示首页
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
