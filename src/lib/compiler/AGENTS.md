# Knowledge Compiler

LLM-driven 8-stage pipeline: raw Markdown → structured `Module` (concepts + laddered quizzes + Feynman task). Yields SSE events for streaming UI. Part of `ai-learning-compiler` — see root `AGENTS.md` for project-level context.

## STRUCTURE

```
src/lib/compiler/
├── pipeline/              # Orchestration (entry point)
│   ├── pipeline.ts        # compileMarkdown() async generator — 8 stages
│   ├── types.ts           # CompileEvent union, CompileStage, CompileConfig, CompileErrorPayload
│   ├── errors.ts          # Error code → Chinese message/hint mapping table
│   └── index.ts           # Public API barrel
├── agents/                # LLM caller + domain assembly
│   ├── _runner.ts         # runAgent(): prompt→chat→JSON→Zod→retry (universal)
│   ├── config.ts          # Per-agent temperature + thinking-mode table
│   ├── mappers.ts         # assembleConcept/Quiz/FeynmanTask/Module + feedback snake→camel
│   └── errors.ts          # AgentOutputError, safeParseJSON, formatZodIssues
├── schemas/               # Zod validation (one per agent output)
│   ├── index.ts           # schemasByAgentKind registry + schemaToPromptHint()
│   └── *.ts               # 11 schema files (import/chunk/concept/module/mission/quiz*/feynman*/feedback/challenge-batch)
├── prompts/               # LLM prompt templates (Markdown + loader/builder)
│   ├── *.md               # 10 agent prompt templates
│   ├── _shared/           # 4 reusable partials (json-output-rules, ladder/expression-level-explanation, distractor-rules)
│   ├── loader.ts          # Reads .md, expands {{> shared/...}} + {{> schema/<kind>}}
│   └── builder.ts         # Variable substitution + system/user message split
└── quality/               # Post-compile reports (observing, not blocking)
    ├── quality-report.ts  # Concept/quiz counts, distribution, rubric coverage
    └── pedagogy-report.ts # Background coverage, extended-knowledge, explanation length
```

## WHERE TO LOOK

| Task                       | Location                                                                               | Notes                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Understand the pipeline    | `pipeline/pipeline.ts:88`                                                              | `compileMarkdown()` — the async generator                                      |
| Non-streaming convenience  | `pipeline/pipeline.ts:810`                                                             | `consumeStream()` → `Promise<Module>`                                          |
| Add a new pipeline stage   | `pipeline/pipeline.ts` + `pipeline/types.ts` `CompileStage`                            | Add stage type, append to generator, update `STAGE_PERCENT`                    |
| Add/modify an LLM agent    | `agents/config.ts` (temp) + `schemas/<kind>.ts` (Zod) + `prompts/<kind>.md` (template) | Three files per agent                                                          |
| Trace LLM call lifecycle   | `agents/_runner.ts:67`                                                                 | `runAgent()` — prompt build → provider.chat → JSON extract → Zod parse → retry |
| Debug prompt assembly      | `prompts/loader.ts` + `prompts/builder.ts`                                             | Partial expansion happens in loader, variable substitution in builder          |
| Understand error codes     | `pipeline/errors.ts` `ERROR_TABLE`                                                     | Maps internal codes → Chinese user-facing `message` + `hint` + `retryable`     |
| Check quiz batch tolerance | `pipeline/pipeline.ts` `salvageQuizBatch` + `autoFixQuizBatch`                         | LLM output repair before retry                                                 |
| See all agent configs      | `agents/config.ts`                                                                     | 11 agents: temperature + disableThinking per agent                             |

## CODE MAP

| Symbol               | Type | Location                   | Role                                                        |
| -------------------- | ---- | -------------------------- | ----------------------------------------------------------- |
| `compileMarkdown`    | fn*  | `pipeline/pipeline.ts:88`  | Entry point. Async generator yielding `CompileEvent`        |
| `consumeStream`      | fn   | `pipeline/pipeline.ts:810` | `Promise<Module>` wrapper for non-SSE callers               |
| `runStage`           | fn   | `pipeline/pipeline.ts`     | Wraps a stage: yield progress → exec → yield complete/error |
| `runAgent`           | fn   | `agents/_runner.ts:67`     | Universal LLM caller with retry + autoFix                   |
| `assembleConcept`    | fn   | `agents/mappers.ts`        | Schema output → `domain.Concept`                            |
| `getSchema`          | fn   | `schemas/index.ts:57`      | `AgentKind` → `ZodSchema` lookup                            |
| `schemaToPromptHint` | fn   | `schemas/index.ts:75`      | Zod → JSON Schema string (embedded in prompt)               |
| `loadPrompt`         | fn   | `prompts/loader.ts`        | Read .md, cache, expand partials                            |
| `buildPrompt`        | fn   | `prompts/builder.ts`       | Variable substitution + ChatMessage[] assembly              |
| `translateError`     | fn   | `pipeline/errors.ts:173`   | Exception → `CompileErrorPayload`                           |
| `makeError`          | fn   | `pipeline/errors.ts:135`   | Construct error from stage + code + vars                    |

## PIPELINE STAGES

`compileMarkdown()` is a single async generator. Each stage calls `runAgent()`, output validated by Zod.

| #   | Stage       | %      | Agent(s)                  | Input → Output                                                          |
| --- | ----------- | ------ | ------------------------- | ----------------------------------------------------------------------- |
| 1   | `import`    | 25%    | import (lightweightModel) | rawMarkdown → `normalizedText`                                          |
| 2   | `chunk`     | 40%    | chunk                     | normalizedText → `chunks[]` (id=`chunk-N`)                              |
| 3   | `concept`   | 55%    | concept                   | chunks → `concepts[]` (2-5, type=fact/procedure/theory)                 |
| 4   | `module`    | 65%    | module                    | concepts → Module shell (title/intro/goal + conceptOrder)               |
| 5   | `mission`   | 70%    | mission                   | concepts → `seriesByConcept` (quiz placeholder slots, 8-15 per concept) |
| 6   | `quiz`      | 80-95% | quiz-batch (×per concept) | placeholders → `Quiz[]` written into `Concept.quizSeries`               |
| 6.5 | `challenge` | 96%    | challenge-batch           | concepts → 3-5 cross-concept quizzes (`ladderLevel=3`)                  |
| 7   | `feynman`   | 100%   | feynman                   | module → `FeynmanTask` (6 steps + rubric)                               |

Final: `buildQualityReport()` → `yield { kind: 'complete', module, qualityReport }`.

## CONVENTIONS

- **No root barrel** — no `compiler/index.ts`. Import from sub-paths: `@/lib/compiler/pipeline`, `@/lib/compiler/schemas`, `@/lib/compiler/agents/mappers`
- **Errors are events, not exceptions** — `yield { kind: 'error', error } + return`. Keeps SSE stream open so frontend gets full error context. NEVER `throw` in pipeline body
- **Two LLM providers** — `lightweightProvider` (import stage) vs `compileProvider` (all generation). Configured via `CompileConfig.lightweightModel` / `compileModel`
- **enableThinking inversion** — caller passes `enableThinking: boolean`; pipeline converts to `disableThinking = !enableThinking` for the runner (M2.5 convention)
- **Per-agent config** — temperature + thinking mode in `agents/config.ts`. Quiz/creative agents = 0.7; deterministic agents = 0.1-0.3
- **Prompt template syntax** — `{{> shared/<file>}}` includes partial; `{{> schema/<kind>}}` injects JSON Schema hint; `{key}` does whitelisted variable substitution (protects literal `{中文}` in templates)
- **Quiz batch mode** — one LLM call generates 6-10 quizzes per concept (not one call per quiz). Parallelized with `QUIZ_BATCH_CONCURRENCY = 3`
- **snake_case in feedback only** — `feedback` agent uses `next_action`/`feedback_text`; `mappers.ts` converts. All other agents are camelCase passthrough
- **JSON Schema is advisory only** — DeepSeek/GLM support `response_format=json_object` but NOT `json_schema` enforcement. Real validation is Zod `safeParse` in `_runner.ts`

## TOLERANCE & DEGRADATION

- **Quiz failure threshold** — `QUIZ_FAILURE_THRESHOLD = 0.2`. If >20% of quiz slots fail → entire compile aborts. Below → failed slots silently dropped (degraded module still produced)
- **salvage** — `salvageQuizBatch()` tries to recover partial valid quizzes from an invalid batch response before giving up
- **autoFix** — `autoFixQuizBatch()` repairs common LLM issues (e.g., `distractor.text === answer`) before retry. Passed as callback to `runAgent()`
- **Retry** — `runAgent()` retries up to `MAX_ATTEMPTS=5` with context-aware retry hints (formats Zod issues into the next attempt's prompt)
- **Stage retry** — `isTransientError()` gates retry: network/timeout/rate-limit = retry; schema validation = fail fast

## AGENT KINDS

11 total (9 compile-time + 2 runtime). Registry: `schemas/index.ts` `schemasByAgentKind`.

| Agent             | Temp | Schema               | Used in pipeline?                  |
| ----------------- | ---- | -------------------- | ---------------------------------- |
| `import`          | 0.1  | importSchema         | Stage 1                            |
| `chunk`           | 0.1  | chunkSchema          | Stage 2                            |
| `concept`         | 0.3  | conceptSchema        | Stage 3                            |
| `module`          | 0.3  | moduleSchema         | Stage 4                            |
| `mission`         | 0.2  | missionSchema        | Stage 5                            |
| `quiz`            | 0.7  | quizSchema           | ❌ Superseded by quiz-batch        |
| `quiz-batch`      | 0.7  | quizBatchSchema      | Stage 6 (per concept)              |
| `challenge-batch` | 0.7  | challengeBatchSchema | Stage 6.5                          |
| `feynman`         | 0.7  | feynmanSchema        | Stage 7                            |
| `feedback`        | 0.1  | feedbackSchema       | Runtime only (`/api/feedback`)     |
| `feynman-eval`    | 0.2  | feynmanEvalSchema    | Runtime only (`/api/feynman-eval`) |

## NOTES

- **Prompt files are bundled** — `next.config.ts` `outputFileTracingIncludes` lists `prompts/*.md` for serverless deploy. Moving prompt files requires config update
- **Schema → prompt injection** — `schemaToPromptHint(kind)` produces JSON Schema text embedded in the system prompt via `{{> schema/<kind>}}`. This is a _hint_; Zod is the _enforcement_
- **Input limits** — `INPUT_MIN_LENGTH = 200`, `INPUT_MAX_LENGTH = 20000` chars. Validated in `validateInput()` before stage 1
- **Progress percent** — defined in `pipeline/types.ts` `STAGE_PERCENT`. Quiz stage is dynamic (80-95% based on completed slots)
- **Quality reports are non-blocking** — `buildQualityReport()` observes the compiled module but never rejects it. Used for UI display only
