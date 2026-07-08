// Schema 工厂与统一导出
// 对应 docs/Prompt-Engineering.md §4
// 用于 lib/compiler/agents/_runner.ts 的 runAgent(kind, input, provider, schema)
import { z, type ZodSchema } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

import { importSchema, type ImportAgentOutput } from './import'
import { chunkSchema, type ChunkAgentOutput } from './chunk'
import { conceptSchema, type ConceptAgentOutput } from './concept'
import { moduleSchema, type ModuleAgentOutput } from './module'
import { missionSchema, type MissionAgentOutput } from './mission'
import { quizSchema, type QuizAgentOutput, quizItemSchema, type QuizItem } from './quiz'
import { quizBatchSchema, type QuizBatchAgentOutput } from './quiz-batch'
import { challengeBatchSchema, type ChallengeBatchAgentOutput } from './challenge-batch'
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
  | 'quiz-batch'
  | 'challenge-batch'

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
  'quiz-batch': quizBatchSchema as ZodSchema<unknown>,
  'challenge-batch': challengeBatchSchema as ZodSchema<unknown>,
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
 * 把 Zod Schema 转 JSON Schema 字符串（嵌入到 Prompt 的 {{> schema/<kind>}} 占位符）。
 *
 * 用于 lib/compiler/prompts/loader.ts 的 partial 展开：shared/json-output-rules.md
 * 里引用 `{{> schema/<agent-kind>}}`，此处产出对应 Agent 的 JSON Schema 文本，
 * 让 LLM 在 system 段直接看到结构约束。
 *
 * 注意：DeepSeek/GLM 仅支持 response_format=json_object，不支持 json_schema 强制，
 * 所以这份 JSON Schema 仅作为"提示"嵌入 prompt，真正的强制校验由 _runner.ts 的 Zod 完成。
 */
export function schemaToPromptHint(kind: AgentKind): string {
  return JSON.stringify(zodToJsonSchema(getSchema(kind), { name: undefined }), null, 2)
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
  QuizBatchAgentOutput,
  ChallengeBatchAgentOutput,
  QuizItem,
}

export {
  importSchema,
  chunkSchema,
  conceptSchema,
  moduleSchema,
  missionSchema,
  quizSchema,
  quizItemSchema,
  quizBatchSchema,
  challengeBatchSchema,
  feynmanSchema,
  feedbackSchema,
  feynmanEvalSchema,
}

// 显式标记 z 已使用（避免未使用 import 警告，未来扩展会用到）
void z
