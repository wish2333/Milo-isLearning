'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { storage } from '@/lib/persistence/client/local-storage'
import { listStoredModules, type StoredModuleSummary } from '@/lib/persistence/module-library'
import { useModuleStore } from '@/lib/state/module-store'

import { ModuleSwitcher } from '@/components/library/ModuleSwitcher'

interface LearnNavTopProps {
  moduleId?: string
  stageLabel: string
}

/**
 * 学习流程统一导航栏。
 *
 * 设计规范：docs/ui-design/styles.css §11 .nav-top
 *   - 暖色暗底半透明背景（rgba(14,19,17,0.92)）+ backdrop-blur(8px)
 *   - 衬线字体、暖象牙白前景
 *   - stageLabel 用 .alc-stage-badge 强调色徽章呈现
 */
export function LearnNavTop({ moduleId, stageLabel }: LearnNavTopProps) {
  const currentModule = useModuleStore((s) => s.currentModule)
  const [modules, setModules] = useState<StoredModuleSummary[]>([])

  useEffect(() => {
    setModules(listStoredModules(storage))
  }, [])

  return (
    <header className="alc-nav-top sticky top-0 z-30">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-6">
          <Link href="/" className="alc-nav-top__link">
            首页
          </Link>
          <Link href="/learn/library" className="alc-nav-top__link">
            我的题库
          </Link>
          <Link href="/learn/overview" className="alc-nav-top__link">
            概览
          </Link>
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          <span className="alc-stage-badge">{stageLabel}</span>
          <ModuleSwitcher modules={modules} currentModuleId={moduleId ?? currentModule?.id} />
        </div>
      </div>
    </header>
  )
}
