'use client'

import { useEffect } from 'react'
import { ProductionHome } from '@/components/home/ProductionHome'
import { useRuntimeMode } from '@/lib/state/runtime-mode-store'

export default function StudioPage() {
  const enterStudio = useRuntimeMode((s) => s.enterStudio)

  useEffect(() => {
    enterStudio()
  }, [enterStudio])

  return <ProductionHome />
}
