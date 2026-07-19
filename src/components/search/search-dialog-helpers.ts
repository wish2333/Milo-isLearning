import type { SearchEntryType, SearchHit } from '@/lib/runtime/search-client'

export interface SearchHitGroup {
  type: SearchEntryType
  label: string
  hits: SearchHit[]
}

export interface HighlightSegment {
  text: string
  highlighted: boolean
}

const SEARCH_GROUPS: ReadonlyArray<{ type: SearchEntryType; label: string }> = [
  { type: 'module', label: '模块' },
  { type: 'concept', label: '概念' },
  { type: 'quiz', label: '题目' },
]

/** 按产品固定顺序分组，忽略没有命中的分组。 */
export function groupSearchHits(hits: readonly SearchHit[]): SearchHitGroup[] {
  return SEARCH_GROUPS.flatMap(({ type, label }) => {
    const groupedHits = hits.filter((hit) => hit.type === type)
    return groupedHits.length > 0 ? [{ type, label, hits: groupedHits }] : []
  })
}

/**
 * 返回可安全渲染的纯文本片段；高亮通过 React 节点完成，不拼接 HTML。
 * 空格分隔的多个查询词分别高亮，大小写与全角归一化与搜索索引保持一致。
 */
export function highlightPlainText(text: string, query: string): HighlightSegment[] {
  const terms = Array.from(
    new Set(
      query
        .normalize('NFKC')
        .toLowerCase()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => right.length - left.length)

  if (terms.length === 0 || text.length === 0) {
    return text.length > 0 ? [{ text, highlighted: false }] : []
  }

  const normalizedText = text.normalize('NFKC').toLowerCase()
  const ranges: Array<[number, number]> = []

  for (const term of terms) {
    let fromIndex = 0
    while (fromIndex < normalizedText.length) {
      const matchIndex = normalizedText.indexOf(term, fromIndex)
      if (matchIndex < 0) break
      ranges.push([matchIndex, matchIndex + term.length])
      fromIndex = matchIndex + term.length
    }
  }

  if (ranges.length === 0) {
    return [{ text, highlighted: false }]
  }

  const mergedRanges = ranges
    .sort((left, right) => left[0] - right[0] || right[1] - left[1])
    .reduce<Array<[number, number]>>((merged, [start, end]) => {
      const previous = merged[merged.length - 1]
      if (!previous || start > previous[1]) {
        merged.push([start, end])
      } else {
        previous[1] = Math.max(previous[1], end)
      }
      return merged
    }, [])

  const segments: HighlightSegment[] = []
  let cursor = 0
  for (const [start, end] of mergedRanges) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), highlighted: false })
    }
    segments.push({ text: text.slice(start, end), highlighted: true })
    cursor = end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false })
  }
  return segments
}

export function getSearchResultHref(moduleId: string): string {
  return `/learn/module/${encodeURIComponent(moduleId)}`
}
