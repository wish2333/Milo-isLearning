import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Fraunces } from 'next/font/google'
import { EnvConfigLoader } from '@/components/EnvConfigLoader'
import { AppShell } from '@/components/AppShell'
import { StorageStatus } from '@/components/StorageStatus'
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
  openGraph: {
    title: 'AI Learning Compiler',
    description: '将任何知识自动编译为一条低摩擦、高掌握度的学习路径',
    type: 'website',
    locale: 'zh_CN',
    siteName: 'AI Learning Compiler',
  },
  twitter: {
    card: 'summary',
    title: 'AI Learning Compiler',
    description: '将任何知识自动编译为一条低摩擦、高掌握度的学习路径',
  },
  icons: {
    icon: '/favicon.ico',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={fraunces.variable}>
      <body>
        <EnvConfigLoader />
        <AppShell>{children}</AppShell>
        <StorageStatus />
      </body>
    </html>
  )
}
