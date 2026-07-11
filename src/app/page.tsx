'use client'

import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { useRuntimeMode } from '@/lib/state/runtime-mode-store'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { ProductionHome } from '@/components/home/ProductionHome'
import { ShowcaseHome } from '@/components/home/ShowcaseHome'

export default function HomePage() {
  const hydrated = useHydrated()
  const studioMode = useRuntimeMode((s) => s.studioMode)

  // hydration 前用构建时默认值（避免 SSR 闪烁），hydration 后用运行时值。
  // studio 上下文下访问 / 也渲染 ProductionHome — 用户通过「返回展示首页」按钮显式退出。
  const effectiveShowcase = hydrated ? isShowcaseMode && !studioMode : isShowcaseMode

  return effectiveShowcase ? <ShowcaseHome /> : <ProductionHome />
}
