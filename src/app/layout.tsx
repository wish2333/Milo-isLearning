import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { EnvConfigLoader } from '@/components/EnvConfigLoader'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Learning Compiler',
  description: '将任何知识自动编译为一条低摩擦、高掌握度的学习路径',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <EnvConfigLoader />
        {children}
      </body>
    </html>
  )
}
