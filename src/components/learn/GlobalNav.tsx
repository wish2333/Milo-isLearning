'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { useRuntimeMode } from '@/lib/state/runtime-mode-store'

export function GlobalNav() {
  const pathname = usePathname()
  const studioMode = useRuntimeMode((s) => s.studioMode)

  // 运行时模式感知：studio 上下文下显示完整导航
  const effectiveShowcase = isShowcaseMode && !studioMode

  const navItems = [
    { href: effectiveShowcase ? '/' : '/studio', label: '首页' },
    { href: '/learn/library', label: '我的题库' },
    ...(effectiveShowcase ? [] : [{ href: '/learn/import', label: '导入新内容' }]),
  ]

  // /learn/module/[id] pages use LearnShell + LearnNavTop internally.
  // Return null here to avoid double navigation.
  if (pathname?.startsWith('/learn/module/')) return null

  return (
    <header className="alc-nav-top sticky top-0 z-30">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-6">
          {navItems.map((item) => {
            const active =
              pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`alc-nav-top__link ${active ? 'alc-nav-top__link--active' : ''}`}
                style={active ? { color: 'var(--accent-primary)' } : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
