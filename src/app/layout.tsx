import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Fraunces } from 'next/font/google'
import { EnvConfigLoader } from '@/components/EnvConfigLoader'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fraunces',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AI Learning Compiler',
  description: '将任何知识自动编译为一条低摩擦、高掌握度的学习路径',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={fraunces.variable}>
      <body>
        {!isShowcaseMode && <EnvConfigLoader />}
        {children}
      </body>
    </html>
  )
}
