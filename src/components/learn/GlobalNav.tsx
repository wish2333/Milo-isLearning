'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { useSettingsStore } from '@/lib/state/settings-store'
import { useRuntimeMode } from '@/lib/state/runtime-mode-store'
import { SearchDialog } from '@/components/search/SearchDialog'

function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

interface NavItem {
  href: string
  label: string
  icon?: boolean
}

export function GlobalNav() {
  const pathname = usePathname()
  const studioMode = useRuntimeMode((s) => s.studioMode)
  const fsrsEnabled = useSettingsStore((s) => s.fsrs.enabled)
  const attemptsBySlot = useAttemptsStore((s) => s.attemptsBySlot)
  const [dueCount, setDueCount] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)

  // 运行时模式感知：studio 上下文下显示完整导航
  const effectiveShowcase = isShowcaseMode && !studioMode

  useEffect(() => {
    if (isShowcaseMode || effectiveShowcase || !fsrsEnabled) {
      setDueCount(0)
      return
    }

    const refreshDueCount = () => {
      setDueCount(scheduleLibrary.listDueBefore(new Date(), getLocalTimezone()).length)
    }
    refreshDueCount()
    const interval = window.setInterval(refreshDueCount, 60_000)
    return () => window.clearInterval(interval)
  }, [attemptsBySlot, effectiveShowcase, fsrsEnabled])

  const navItems: NavItem[] = [
    { href: effectiveShowcase ? '/' : '/studio', label: '首页' },
    { href: '/learn/library', label: '我的题库' },
    ...(effectiveShowcase ? [] : [{ href: '/learn/import', label: '导入新内容' }]),
    ...(!isShowcaseMode && !effectiveShowcase
      ? [{ href: '/learn/today', label: '今日复习', icon: true }]
      : []),
  ]

  // /learn/module/[id] pages use LearnShell + LearnNavTop internally.
  // SearchDialog remains mounted there so Cmd/Ctrl+K works throughout the learning flow.
  if (pathname?.startsWith('/learn/module/')) {
    return <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
  }

  return (
    <>
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
                  {item.icon ? (
                    <span className="relative inline-flex items-center gap-1.5">
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
                        <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17" />
                      </svg>
                      <span>{item.label}</span>
                      {fsrsEnabled && dueCount > 0 && (
                        <span
                          className="rounded-full bg-accent-primary px-1.5 text-[10px] leading-4 text-bg-base"
                          aria-label={`${dueCount} 道今日到期`}
                        >
                          {dueCount > 99 ? '99+' : dueCount}
                        </span>
                      )}
                    </span>
                  ) : (
                    item.label
                  )}
                </Link>
              )
            })}
          </nav>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="打开搜索（⌘K 或 Ctrl+K）"
            className="alc-nav-top__link inline-flex items-center gap-2 rounded px-2 py-1"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <span>搜索</span>
            <kbd className="hidden rounded border border-border-default px-1.5 py-0.5 text-[11px] text-fg-tertiary sm:inline-block">
              ⌘K / Ctrl K
            </kbd>
          </button>
        </div>
      </header>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}
