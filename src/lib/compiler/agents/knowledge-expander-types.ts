/**
 * AI 扩充 Agent 的结构化输出契约。
 *
 * 扩充 Agent 先生成一份可交给既有编译流水线的完整 Markdown，
 * 再通过稳定的 anchorId 将知识页回填到后续 Concept 产物中。
 */
import { z } from 'zod'

const conceptAnchorSchema = z.object({
  /** 稳定 ID；回填时只按 ID 精确匹配，不按名称模糊匹配。 */
  anchorId: z.string().min(1, 'anchorId 不能为空').max(100, 'anchorId ≤ 100 字'),
  name: z.string().min(1, 'name 不能为空').max(50, 'name ≤ 50 字'),
  /** 知识页正文：设计约束为 200-500 字。 */
  knowledgePage: z
    .string()
    .min(200, 'knowledgePage 至少 200 字')
    .max(500, 'knowledgePage ≤ 500 字'),
})

export const expandedKnowledgeSchema = z
  .object({
    title: z.string().min(1, 'title 不能为空').max(50, 'title ≤ 50 字'),
    intro: z.string().min(1, 'intro 不能为空').max(100, 'intro ≤ 100 字'),
    goal: z.string().min(1, 'goal 不能为空').max(75, 'goal ≤ 75 字'),
    /** 需满足既有 compileMarkdown 的输入长度约束。 */
    normalizedSource: z
      .string()
      .min(1000, 'normalizedSource 至少 1000 字')
      .max(20000, 'normalizedSource ≤ 20000 字'),
    conceptAnchors: z
      .array(conceptAnchorSchema)
      .min(2, 'conceptAnchors 至少 2 个')
      .max(5, 'conceptAnchors 至多 5 个'),
  })
  .superRefine((value, ctx) => {
    const anchorIds = value.conceptAnchors.map((anchor) => anchor.anchorId)
    const duplicateAnchorIds = anchorIds.filter((id, index) => anchorIds.indexOf(id) !== index)
    if (duplicateAnchorIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `anchorId 重复：${[...new Set(duplicateAnchorIds)].join(', ')}`,
        path: ['conceptAnchors'],
      })
    }

    const names = value.conceptAnchors.map((anchor) => anchor.name)
    const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index)
    if (duplicateNames.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Concept name 重复：${[...new Set(duplicateNames)].join(', ')}`,
        path: ['conceptAnchors'],
      })
    }
  })

export type ConceptAnchor = z.infer<typeof conceptAnchorSchema>
export type ExpandedKnowledge = z.infer<typeof expandedKnowledgeSchema>

/** 供 Agent 注册表或调用方复用的 anchor 子 Schema。 */
export { conceptAnchorSchema }
