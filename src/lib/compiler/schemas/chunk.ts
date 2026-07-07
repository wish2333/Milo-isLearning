// Chunk Agent 输出 Schema
// 对应 lib/compiler/prompts/chunk.md
// PRD §7.2
import { z } from 'zod'

export const chunkSchema = z.object({
  chunks: z.array(
    z.object({
      id: z.string().regex(/^chunk-\d+$/, 'id 必须为 chunk-N 格式'),
      text: z.string().min(50, '单 Chunk 至少 50 字符'),
      heading: z.string().min(1, 'heading 不能为空'),
    }),
  ).min(1, '至少 1 个 Chunk'),
}).superRefine((val, ctx) => {
  // 检查 id 唯一性
  const ids = val.chunks.map((c) => c.id)
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dupIds.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Chunk id 重复：${dupIds.join(', ')}`,
      path: ['chunks'],
    })
  }
  // 检查序号连续
  // id 格式已由 regex 保证为 chunk-N；split[1] 兜底为空串让 parseInt 返回 NaN
  const nums = ids
    .map((id) => parseInt(id.split('-')[1] ?? '', 10))
    .sort((a, b) => a - b)
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i]
    if (n !== i + 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Chunk 序号不连续，期望 chunk-${i + 1}`,
        path: ['chunks'],
      })
      break
    }
  }
})

export type ChunkAgentOutput = z.infer<typeof chunkSchema>
