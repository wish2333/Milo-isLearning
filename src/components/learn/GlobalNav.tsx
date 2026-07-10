'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: '首页' },
  { href: '/learn/library', label: '我的题库' },
  { href: '/learn/import', label: '导入新内容' },
]

export function GlobalNav() {
  const pathname = usePathname()

  // /learn/module/[id] pages use LearnShell + LearnNavTop internally.
  // Return null here to avoid double navigation.
  if (pathname?.startsWith('/learn/module/')) return null

  return (
    <header className="alc-nav-top sticky top-0 z-30">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
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
