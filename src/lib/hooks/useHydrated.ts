'use client'

import { useEffect, useState } from 'react'

/**
 * useHydrated — Client-side hydration guard
 *
 * Returns false during SSR and the first client render,
 * then true after useEffect fires (second client render).
 *
 * Use this to prevent premature redirects/fire-and-forget effects
 * that depend on persisted state (Zustand persist) being available.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])
  return hydrated
}
