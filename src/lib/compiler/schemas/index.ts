// Schema 工厂与统一导出
// 对应 docs/Prompt-Engineering.md §4
// 用于 lib/compiler/agents/_runner.ts 的 runAgent(kind, input, provider, schema)
import { z, type ZodSchema } from 'zod'

import { importSchema, type ImportAgentOutput } from './import'
import { chunkSchema, type ChunkAgentOutput } from './chunk'
import { conceptSchema, type ConceptAgentOutput } from './concept'
import { moduleSchema, type ModuleAgentOutput } from './module'
import { missionSchema, type MissionAgentOutput } from './mission'
import { quizSchema, type QuizAgentOutput } from './quiz'
import { feynmanSchema, type FeynmanAgentOutput } from './feynman'
import { feedbackSchema, type FeedbackAgentOutput } from './feedback'
import { feynmanEvalSchema, type FeynmanEvalOutput } from './feynman-eval'

/**
 * Agent 类型枚举（与 buildPrompt 的 kind 参数对齐）
 */
export type AgentKind =
  | 'import'
  | 'chunk'
  | 'concept'
  | 'module'
  | 'mission'
  | 'quiz'
  | 'feynman'
  | 'feedback'
  | 'feynman-eval'

/**
 * Agent 输出 Schema 注册表
 * key: AgentKind
 * value: ZodSchema
 */
export const schemasByAgentKind: Readonly<Record<AgentKind, ZodSchema<unknown>>> = Object.freeze({
  import: importSchema as ZodSchema<unknown>,
  chunk: chunkSchema as ZodSchema<unknown>,
  concept: conceptSchema as ZodSchema<unknown>,
  module: moduleSchema as ZodSchema<unknown>,
  mission: missionSchema as ZodSchema<unknown>,
  quiz: quizSchema as ZodSchema<unknown>,
  feynman: feynmanSchema as ZodSchema<unknown>,
  feedback: feedbackSchema as ZodSchema<unknown>,
  'feynman-eval': feynmanEvalSchema as ZodSchema<unknown>,
})

/**
 * 根据 AgentKind 取对应 Schema
 */
export function getSchema(kind: AgentKind): ZodSchema<unknown> {
  const schema = schemasByAgentKind[kind]
  if (!schema) {
    throw new Error(`Unknown AgentKind: ${kind}`)
  }
  return schema
}

/**
 * 把 Zod Schema 转 JSON Schema 字符串（嵌入到 Prompt 的 {{> schema/<kind>}} 占位符）
 * 实现略：使用 zod-to-json-schema 包（M2 引入）
 */
export function schemaToPromptHint(kind: AgentKind): string {
  // TODO: M2 期间引入 zod-to-json-schema 包
  // import { zodToJsonSchema } from 'zod-to-json-schema'
  // return JSON.stringify(zodToJsonSchema(getSchema(kind)), null, 2)
  return `[Schema for ${kind} - 见 lib/compiler/schemas/${kind.replace('-', '_')}.ts]`
}

// 类型重导出
export type {
  ImportAgentOutput,
  ChunkAgentOutput,
  ConceptAgentOutput,
  ModuleAgentOutput,
  MissionAgentOutput,
  QuizAgentOutput,
  FeynmanAgentOutput,
  FeedbackAgentOutput,
  FeynmanEvalOutput,
}

export {
  importSchema,
  chunkSchema,
  conceptSchema,
  moduleSchema,
  missionSchema,
  quizSchema,
  feynmanSchema,
  feedbackSchema,
  feynmanEvalSchema,
}

// 显式标记 z 已使用（避免未使用 import 警告，未来扩展会用到）
void z
