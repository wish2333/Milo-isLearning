import { describe, expect, it } from 'vitest'

import type { SearchHit } from '@/lib/runtime/search-client'
import { getSearchResultHref, groupSearchHits, highlightPlainText } from './search-dialog-helpers'

function hit(type: SearchHit['type'], id: string): SearchHit {
  return {
    type,
    moduleId: `module-${id}`,
    title: `${type}-${id}`,
    content: `content-${id}`,
    snippet: `snippet-${id}`,
    score: 1,
  }
}

describe('search dialog helpers', () => {
  it('按模块、概念、题目顺序分组并忽略空组', () => {
    const groups = groupSearchHits([hit('quiz', '1'), hit('module', '2'), hit('concept', '3')])

    expect(groups.map((group) => group.type)).toEqual(['module', 'concept', 'quiz'])
    expect(groups.map((group) => group.hits[0]?.title)).toEqual(['module-2', 'concept-3', 'quiz-1'])
  })

  it('生成纯文本高亮片段，支持中文与多个查询词', () => {
    expect(highlightPlainText('AI 学习 Compiler', '学习 compiler')).toEqual([
      { text: 'AI ', highlighted: false },
      { text: '学习', highlighted: true },
      { text: ' ', highlighted: false },
      { text: 'Compiler', highlighted: true },
    ])
  })

  it('查询为空或未命中时不生成高亮', () => {
    expect(highlightPlainText('纯文本', '   ')).toEqual([{ text: '纯文本', highlighted: false }])
    expect(highlightPlainText('纯文本', '不存在')).toEqual([{ text: '纯文本', highlighted: false }])
  })

  it('对 module id 做 URL 编码', () => {
    expect(getSearchResultHref('module/中文')).toBe('/learn/module/module%2F%E4%B8%AD%E6%96%87')
  })
})
