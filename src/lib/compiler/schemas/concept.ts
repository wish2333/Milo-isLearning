// Concept Agent 输出 Schema
// 对应 lib/compiler/prompts/concept.md
// PRD §7.3
import { z } from 'zod'

export const conceptSchema = z
  .object({
    reasoning: z.string().min(1, '私有 CoT 不能为空'),
    concepts: z
      .array(
        z.object({
          id: z.string().regex(/^concept-\d+$/, 'id 必须为 concept-N 格式'),
          name: z.string().min(1).max(50, 'name ≤ 50 字'),
          definition: z.string().min(1).max(75, 'definition ≤ 75 字'),
          type: z.enum(['fact', 'procedure', 'theory']),
          keyPoints: z.array(z.string().min(1).max(40, 'keyPoint ≤ 40 字')).min(2).max(4),
          parentChunkId: z.string().regex(/^chunk-\d+$/, 'parentChunkId 必须为 chunk-N 格式'),
        }),
      )
      .min(2, 'Concept 数 ≥ 2')
      .max(5, 'Concept 数 ≤ 5'),
  })
  .superRefine((val, ctx) => {
    // id 唯一性
    const ids = val.concepts.map((c) => c.id)
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
    if (dup.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Concept id 重复：${dup.join(', ')}`,
        path: ['concepts'],
      })
    }
    // name 唯一性（不允许同义概念重复）
    const names = val.concepts.map((c) => c.name)
    const dupName = names.filter((n, i) => names.indexOf(n) !== i)
    if (dupName.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Concept name 重复：${dupName.join(', ')}`,
        path: ['concepts'],
      })
    }
  })

export type ConceptAgentOutput = z.infer<typeof conceptSchema>
