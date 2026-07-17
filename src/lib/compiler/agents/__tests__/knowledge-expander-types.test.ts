import { describe, expect, it } from 'vitest'

import {
  conceptAnchorSchema,
  expandedKnowledgeSchema,
  type ExpandedKnowledge,
} from '../knowledge-expander-types'

const makeAnchor = (index: number, knowledgePageLength = 200) => ({
  anchorId: `anchor-${index}`,
  name: `概念 ${index}`,
  knowledgePage: '知'.repeat(knowledgePageLength),
})

const makeExpanded = (anchorCount = 2): ExpandedKnowledge => ({
  title: '检索增强生成',
  intro: '理解检索增强生成的核心概念与工作流程。',
  goal: '能够解释检索、生成与评估之间的关系。',
  normalizedSource: '# 检索增强生成\n\n' + '内容'.repeat(500),
  conceptAnchors: Array.from({ length: anchorCount }, (_, index) => makeAnchor(index + 1)),
})

describe('expandedKnowledgeSchema', () => {
  it('accepts the minimum valid expanded knowledge payload', () => {
    expect(expandedKnowledgeSchema.safeParse(makeExpanded()).success).toBe(true)
  })

  it('requires two to five concept anchors', () => {
    expect(expandedKnowledgeSchema.safeParse(makeExpanded(1)).success).toBe(false)
    expect(expandedKnowledgeSchema.safeParse(makeExpanded(6)).success).toBe(false)
    expect(expandedKnowledgeSchema.safeParse(makeExpanded(5)).success).toBe(true)
  })

  it('enforces normalized source and knowledge page length boundaries', () => {
    const tooShortSource = { ...makeExpanded(), normalizedSource: 'x'.repeat(999) }
    const tooLongSource = { ...makeExpanded(), normalizedSource: 'x'.repeat(20001) }
    const tooShortPage = { ...makeExpanded(), conceptAnchors: [makeAnchor(1, 199), makeAnchor(2)] }
    const tooLongPage = { ...makeExpanded(), conceptAnchors: [makeAnchor(1, 501), makeAnchor(2)] }

    expect(expandedKnowledgeSchema.safeParse(tooShortSource).success).toBe(false)
    expect(expandedKnowledgeSchema.safeParse(tooLongSource).success).toBe(false)
    expect(expandedKnowledgeSchema.safeParse(tooShortPage).success).toBe(false)
    expect(expandedKnowledgeSchema.safeParse(tooLongPage).success).toBe(false)
  })

  it('rejects duplicate anchor IDs and names', () => {
    const duplicateId = makeExpanded()
    duplicateId.conceptAnchors[1] = { ...duplicateId.conceptAnchors[1]!, anchorId: 'anchor-1' }
    const duplicateName = makeExpanded()
    duplicateName.conceptAnchors[1] = { ...duplicateName.conceptAnchors[1]!, name: '概念 1' }

    expect(expandedKnowledgeSchema.safeParse(duplicateId).success).toBe(false)
    expect(expandedKnowledgeSchema.safeParse(duplicateName).success).toBe(false)
  })
})

describe('conceptAnchorSchema', () => {
  it('rejects empty anchor identifiers and names', () => {
    expect(conceptAnchorSchema.safeParse({ ...makeAnchor(1), anchorId: '' }).success).toBe(false)
    expect(conceptAnchorSchema.safeParse({ ...makeAnchor(1), name: '' }).success).toBe(false)
  })
})
