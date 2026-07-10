import type { ReactNode } from 'react'

import { GlobalNav } from '@/components/learn/GlobalNav'

export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <GlobalNav />
      {children}
    </>
  )
}
