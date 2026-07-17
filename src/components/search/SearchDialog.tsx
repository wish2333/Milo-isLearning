'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { StorageKeys } from '@/lib/persistence/shared/keys'
import { getStorage } from '@/lib/persistence/client/storage'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { useRuntimeMode } from '@/lib/state/runtime-mode-store'
import { ClientSearchIndex, type SearchHit } from '@/lib/runtime/search-client'
import type { Module } from '@/types/domain'

import { getSearchResultHref, groupSearchHits, highlightPlainText } from './search-dialog-helpers'

interface SearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SEARCH_DEBOUNCE_MS = 200

function readCurrentModules(): Module[] {
  const repository = getStorage()
  const modulePrefix = StorageKeys.module('')
  const effectiveShowcase = isShowcaseMode && !useRuntimeMode.getState().studioMode

  return repository
    .keys()
    .filter((key) => key.startsWith(modulePrefix))
    .map((key) => repository.get<Module>(key))
    .filter((module): module is Module => module !== null)
    .filter((module) =>
      effectiveShowcase ? module.origin === 'showcase' : module.origin !== 'showcase',
    )
}

function getTypeLabel(type: SearchHit['type']): string {
  switch (type) {
    case 'module':
      return '模块'
    case 'concept':
      return '概念'
    case 'quiz':
      return '题目'
  }
}

function SearchResult({
  hit,
  query,
  active,
  index,
  onSelect,
  onHover,
}: {
  hit: SearchHit
  query: string
  active: boolean
  index: number
  onSelect: (hit: SearchHit) => void
  onHover: () => void
}) {
  const titleSegments = highlightPlainText(hit.title, query)
  const snippetSegments = highlightPlainText(hit.snippet, query)
  const resultId = `search-result-${index}`

  return (
    <button
      id={resultId}
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onSelect(hit)}
      onMouseEnter={onHover}
      className={`block w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
        active
          ? 'border-accent-primary/50 bg-accent-primary-soft'
          : 'border-transparent hover:border-border-default hover:bg-bg-surface'
      }`}
    >
      <span className="flex items-center gap-2 text-sm text-fg-primary">
        <span className="shrink-0 text-[11px] uppercase tracking-wide text-accent-primary">
          {getTypeLabel(hit.type)}
        </span>
        <span className="min-w-0 truncate">
          {titleSegments.map((segment) =>
            segment.highlighted ? (
              <mark
                key={`${resultId}-title-${segment.text}-${segment.highlighted}`}
                className="rounded bg-accent-primary/30 px-0.5 text-fg-primary"
              >
                {segment.text}
              </mark>
            ) : (
              <span key={`${resultId}-title-${segment.text}-${segment.highlighted}`}>
                {segment.text}
              </span>
            ),
          )}
        </span>
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-fg-secondary">
        {snippetSegments.map((segment) =>
          segment.highlighted ? (
            <mark
              key={`${resultId}-snippet-${segment.text}-${segment.highlighted}`}
              className="rounded bg-accent-primary/20 px-0.5 text-fg-primary"
            >
              {segment.text}
            </mark>
          ) : (
            <span key={`${resultId}-snippet-${segment.text}-${segment.highlighted}`}>
              {segment.text}
            </span>
          ),
        )}
      </span>
    </button>
  )
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const indexRef = useRef<ClientSearchIndex | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  if (indexRef.current === null) {
    indexRef.current = new ClientSearchIndex()
  }

  useEffect(() => {
    if (!open) return

    indexRef.current?.rebuild(readCurrentModules())
    setQuery('')
    setDebouncedQuery('')
    setActiveIndex(0)

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(focusTimer)
  }, [open])

  useEffect(() => {
    const shortcutHandler = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(!open)
      }
      if (open && event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', shortcutHandler)
    return () => window.removeEventListener('keydown', shortcutHandler)
  }, [onOpenChange, open])

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(debounceTimer)
  }, [query])

  const hits = useMemo(
    () => (debouncedQuery ? (indexRef.current?.search(debouncedQuery) ?? []) : []),
    [debouncedQuery],
  )
  const groups = useMemo(() => groupSearchHits(hits), [hits])

  useEffect(() => {
    setActiveIndex((current) => (hits.length === 0 ? 0 : Math.min(current, hits.length - 1)))
  }, [hits.length])

  const handleSelect = (hit: SearchHit) => {
    onOpenChange(false)
    router.push(getSearchResultHref(hit.moduleId))
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (hits.length === 0 ? 0 : (current + 1) % hits.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) =>
        hits.length === 0 ? 0 : (current - 1 + hits.length) % hits.length,
      )
    } else if (event.key === 'Enter' && hits[activeIndex]) {
      event.preventDefault()
      handleSelect(hits[activeIndex])
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-[12vh]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false)
      }}
    >
      <section
        className="alc-card-elevated flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-dialog-title"
      >
        <div className="border-b border-border-default px-4 py-3">
          <h2 id="search-dialog-title" className="sr-only">
            搜索题库
          </h2>
          <div className="flex items-center gap-3">
            <svg
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-fg-tertiary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="搜索模块、概念或题目..."
              aria-label="搜索模块、概念或题目"
              aria-controls="search-results"
              aria-activedescendant={hits[activeIndex] ? `search-result-${activeIndex}` : undefined}
              className="min-w-0 flex-1 bg-transparent text-base text-fg-primary outline-none placeholder:text-fg-tertiary"
            />
            <kbd className="hidden shrink-0 rounded border border-border-default px-1.5 py-0.5 text-[11px] text-fg-tertiary sm:inline-block">
              ESC
            </kbd>
          </div>
        </div>

        <div
          id="search-results"
          role="listbox"
          aria-label="搜索结果"
          className="overflow-y-auto p-2"
        >
          {!debouncedQuery.trim() ? (
            <p className="px-3 py-8 text-center text-sm text-fg-tertiary">输入关键词开始搜索</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-fg-tertiary">没有找到匹配内容</p>
          ) : (
            groups.map((group) => {
              return (
                <section key={group.type} className="space-y-1.5 pb-3 last:pb-0">
                  <h3 className="px-3 pb-1 text-xs font-medium tracking-wide text-fg-tertiary">
                    {group.label}
                  </h3>
                  {group.hits.map((hit) => {
                    const resultIndex = hits.indexOf(hit)
                    return (
                      <SearchResult
                        key={`${hit.type}-${hit.moduleId}-${hit.conceptId ?? ''}-${hit.quizId ?? ''}`}
                        hit={hit}
                        query={debouncedQuery}
                        active={resultIndex === activeIndex}
                        index={resultIndex}
                        onSelect={handleSelect}
                        onHover={() => setActiveIndex(resultIndex)}
                      />
                    )
                  })}
                </section>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border-default px-4 py-2 text-[11px] text-fg-tertiary">
          <span>↑↓ 选择 · Enter 打开</span>
          <span>Esc 关闭</span>
        </div>
      </section>
    </div>
  )
}
