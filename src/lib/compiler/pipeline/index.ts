/**
 * Knowledge Compiler Pipeline 对外入口
 *
 * 对应 docs/M3-Plan.md §W1。
 *
 * 用法（流式 SSE 端点）：
 *   ```ts
 *   import { compileMarkdown } from '@/lib/compiler/pipeline'
 *   for await (const event of compileMarkdown(md, cfg)) {
 *     // 把 event 转 SSE 推给客户端
 *   }
 *   ```
 *
 * 用法（非流式，如 smoke 脚本）：
 *   ```ts
 *   import { compileMarkdown, consumeStream } from '@/lib/compiler/pipeline'
 *   const module = await consumeStream(compileMarkdown(md, cfg))
 *   ```
 *
 * 不做的事（由调用方负责）：
 *   - 持久化（M3 不写 LocalStorage，由 M4 负责）
 *   - SSE 协议转换（由 src/app/api/compile/route.ts 负责）
 *   - 模型决策（默认模型表在 W8 决策报告后回填 §4.5）
 */
export { compileMarkdown, consumeStream } from './pipeline'
export {
  ERROR_TABLE,
  makeError,
  makeInputError,
  makeQuizBatchError,
  providerErrorKindToCode,
  translateError,
  type ErrorMapping,
} from './errors'
export {
  INPUT_MAX_LENGTH,
  INPUT_MIN_LENGTH,
  QUIZ_FAILURE_THRESHOLD,
  QUIZ_PERCENT_END,
  QUIZ_PERCENT_START,
  STAGE_PERCENT,
  type CompileConfig,
  type CompileErrorPayload,
  type CompileErrorCode,
  type CompileEvent,
  type CompileOptions,
  type CompileStage,
} from './types'
