'use client'

import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { useRuntimeMode } from '@/lib/state/runtime-mode-store'
import { useHydrated } from '@/lib/hooks/useHydrated'
import { ProductionSettings } from '@/components/settings/ProductionSettings'
import { ShowcaseSettings } from '@/components/settings/ShowcaseSettings'

export default function SettingsPage() {
  const hydrated = useHydrated()
  const studioMode = useRuntimeMode((s) => s.studioMode)

  // hydration 前用构建时默认值，hydration 后用运行时值
  const effectiveShowcase = hydrated ? isShowcaseMode && !studioMode : isShowcaseMode

  return effectiveShowcase ? <ShowcaseSettings /> : <ProductionSettings />
}
