# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-10
**Commit:** 2b3dd20
**Branch:** main
**Docs version:** v1.0.0 (PRD V2.0) — v0.1.0 archive below `docs/v0.1.0/`

## OVERVIEW

`ai-learning-compiler` — Next.js 15 + React 19 app that "compiles" raw Markdown into structured interactive learning modules (concepts → laddered quizzes → Feynman teach-back). LLM-driven 8-stage pipeline, zero-backend (LocalStorage only), Chinese-first. See `src/lib/compiler/AGENTS.md` for the compiler subsystem.

## STRUCTURE

```
.
├── src/
│   ├── app/                 # Next.js App Router: pages + API routes
│   │   ├── api/             # 6 stateless routes (LLM proxies)
│   │   │   ├── compile/         # SSE streaming endpoint (core)
│   │   │   ├── feedback/        # Answer feedback agent
│   │   │   ├── feynman-eval/    # Feynman step-6 scoring
│   │   │   ├── regenerate/      # Retry quiz replacement
│   │   │   ├── env-config/      # Proxy .env.local keys to client
│   │   │   └── ping/            # Provider health check
│   │   └── learn/           # 7-page learning journey (import→compile→overview→module→done + library + history)
│   ├── components/
│   │   ├── learn/           # 11 learning-flow components (state machine driven)
│   │   ├── quiz/            # 4 quiz renderers + FeedbackPanel (choice/sorting/fill_blank)
│   │   └── library/         # 4 module management components
│   ├── lib/
│   │   ├── compiler/        # ★ Knowledge Compiler (see its own AGENTS.md)
│   │   ├── providers/       # LLM abstraction: factory + OpenAI-compat base + 3 vendors
│   │   ├── runtime/         # Pure business logic: evaluate-answer, mastery, retry-policy, adaptive-sequencer
│   │   ├── persistence/     # LocalStorage via StorageRepository iface; quota mgmt; module export/import
│   │   ├── state/           # 5 Zustand stores (+1 non-persisted compile-store)
│   │   └── hooks/           # useHydrated (SSR guard for Zustand persist)
│   └── types/
│       └── domain.ts        # ALL domain models (Module, Concept, Quiz, ModuleStage, Mastery, etc.)
├── docs/
│   ├── v0.1.0/               # Archived: V1.0 PRD + all development docs (M1–M7.6)
│   │   ├── PRD.md            # V1.0 PRD (superseded by v1.0.0/PRD.md)
│   │   ├── PRD-Report.md     # Audit report that drove V2.0 revision
│   │   ├── Product-Specification.md
│   │   ├── Technical-Specification.md
│   │   ├── Prompt-Engineering.md
│   │   ├── prompt-evaluation.md
│   │   ├── dev-guide.md
│   │   ├── M*-Review.md / M*-Plan.md / M*-Dev.md / M*-Report.md
│   │   └── ui-design/        # 18 HTML mockup prototypes + DESIGN-SPEC.md
│   └── v1.0.0/
│       ├── PRD.md            # ★ V2.0 PRD (current — includes FR-09~FR-12, NP-01~NP-14)
│       └── PRD-Report.md     # Audit report (copy, for reference)
├── scripts/                 # Bun CLI: ping.ts, prompt-eval.ts, m3-smoke.ts
├── e2e/                     # Playwright tests (workers=1, fullyParallel=false)
└── references/              # Session notes/external references
```

## WHERE TO LOOK

| Task                          | Location                                                                | Notes                                                            |
| ----------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Understand domain model       | `src/types/domain.ts`                                                   | Single source of truth — read first                              |
| Trace compile flow            | `src/lib/compiler/AGENTS.md` → `pipeline/pipeline.ts:88`                | `compileMarkdown()` async generator                              |
| Add API route                 | `src/app/api/<name>/route.ts`                                           | Stateless proxy to LLM; vercel.json sets `maxDuration`           |
| Change quiz rendering         | `src/components/quiz/QuizRenderer.tsx`                                  | Dispatches by `interactionType`                                  |
| Modify learning state machine | `src/lib/state/progress-store.ts` + `domain.ts` `ModuleStage`           | Discriminated union — illegal transitions = compile error        |
| Add LLM provider              | `src/lib/providers/`                                                    | Factory + `createProvider()` switch; exhaustive `never` check    |
| Evaluate user answer          | `src/lib/runtime/evaluate-answer.ts`                                    | Choice/Sorting=exact; FillBlank=normalized→semantic LLM fallback |
| Access LocalStorage           | `src/lib/persistence/repository.ts` (iface) → `local-storage.ts` (impl) | NEVER use `localStorage` directly                                |
| Storage key naming            | `src/lib/persistence/keys.ts`                                           | All keys via `StorageKeys` obj, `alc:` prefix                    |
| LLM config / API key          | `src/lib/state/settings-store.ts`                                       | Stored in LocalStorage; `.env.local` keys auto-loaded            |
| Product requirements          | `docs/v1.0.0/PRD.md`                                                    | MoSCoW priorities, FR-* IDs (V2.0 with FR-09~FR-12)              |
| Architecture decisions        | `docs/v0.1.0/Technical-Specification.md`                                | §3 Providers, §5 Runtime, §6.2 Store split                       |
| Design tokens / theme         | `src/app/globals.css`                                                   | Dark-only; CSS custom properties; `alc-*` utility classes        |

## CODE MAP

Core symbols (highest centrality). Full compiler map → `src/lib/compiler/AGENTS.md`.

| Symbol                  | Type  | Location                            | Role                                                  |
| ----------------------- | ----- | ----------------------------------- | ----------------------------------------------------- |
| `compileMarkdown`       | fn*   | `compiler/pipeline/pipeline.ts:88`  | Async generator: 8-stage compile, yields SSE events   |
| `consumeStream`         | fn    | `compiler/pipeline/pipeline.ts:810` | Wraps generator → `Promise<Module>`                   |
| `runAgent`              | fn    | `compiler/agents/_runner.ts:67`     | Universal LLM caller: prompt→chat→JSON→Zod→retry      |
| `createProvider`        | fn    | `providers/index.ts:43`             | Factory: dispatches deepseek/glm/sensenova            |
| `computeMastery`        | fn    | `runtime/mastery.ts`                | Pure: first-attempt pass rate + completion %          |
| `evaluateAnswer`        | fn    | `runtime/evaluate-answer.ts`        | Pure: deterministic scoring (semantic fallback async) |
| `buildAdaptiveQueue`    | fn    | `runtime/adaptive-sequencer.ts`     | Reorders unseen/wrong/due slots                       |
| `ModuleStage`           | union | `types/domain.ts:205`               | 7-state discriminated union state machine             |
| `useProgressStore`      | store | `state/progress-store.ts`           | State machine transitions + Feynman tracking          |
| `useModuleStore`        | store | `state/module-store.ts`             | Current Module/Quiz; `replaceCurrentQuiz()` for retry |
| `compileMarkdown` (API) | route | `app/api/compile/route.ts`          | SSE endpoint consuming the pipeline generator         |

## CONVENTIONS

- **Bun toolchain** — `bun run dev/test/build`. Scripts needing env: `bun --env-file=.env.local run scripts/*.ts`
- **Path alias** `@/*` → `./src/*`
- **Zustand everywhere** — 5 persisted stores (`alc:state:*` keys) + 1 volatile (`compile-store`). Stores cross-ref via `.getState()`
- **Persist middleware** — `persist(createJSONStorage(() => localStorage))`. Guard SSR with `useHydrated()` hook
- **Discriminated union state machine** — `ModuleStage.kind` field; illegal transitions caught at compile time
- **Exhaustive switch** — Provider dispatch uses `const _: never = x` pattern for compile-time coverage
- **Chinese-first** — comments, error messages, UI text, `lang="zh-CN"`. Not i18n; single locale
- **Design tokens** — colors/fonts via CSS custom properties in `globals.css`, NOT Tailwind defaults. `alc-*` classes for page layout
- **Dark-only** — no light theme. Warm amber accent (`#d4a574`), sage success (`#7fa88c`), muted terracotta danger (no bright red)
- **Serif-first body** — Fraunces + Source Han Serif SC (not typical sans-serif)
- **Two-model compile** — `lightweightModel` (import) vs `compileModel` (generation); cost optimization
- **Retry = quiz replacement** — failing generates a NEW quiz via `/api/regenerate`; state machine does NOT advance

## ANTI-PATTERNS (THIS PROJECT)

- **NO `console.log`** — ESLint `no-console` allows only `.warn/.error/.info`
- **NO `any`** — `@typescript-eslint/no-explicit-any: error`. Test files exempted
- **NO bare `localStorage.xxx`** — must go through `StorageRepository` + `storage` singleton
- **NO raw string storage keys** — use `StorageKeys` from `persistence/keys.ts`
- **NO `throw` in compiler pipeline** — `yield { kind: 'error' } + return` (keeps SSE stream open)
- **NO silent eviction** — `ensureCapacity()` is intentionally a no-op; deletion must be explicit user action
- **NO apiKey in exported packages** — `parseModulePackage` rejects JSON containing `"apiKey"`
- **NO `eslint-plugin-prettier`** — Prettier (format) and ESLint (quality) are separate
- **NO global test fns** — `vitest` `globals: false`; must `import { describe, it, expect }`
- **NO `allowJs`** — TypeScript-only (`allowJs: false`)
- **NO reading `.env.local`** — contains provider API keys (DEEPSEEK/GLM/SENSENOVA). Never `cat`/`read`/`grep` it. Keys are proxied to client via `/api/env-config`; use `settings-store.getLLMConfig()` at runtime

## COMMANDS

```bash
bun run dev              # Next.js dev server
bun run build            # Production build
bun run typecheck        # tsc --noEmit
bun run test             # vitest run (unit, node env)
bun run e2e              # playwright test (workers=1)
bun run lint             # eslint .
bun run format           # prettier --write .
bun run ping             # LLM provider health check
bun run eval             # Prompt evaluation framework
bun --env-file=.env.local run scripts/m3-smoke.ts  # End-to-end compile smoke
```

## NOTES

- **`outputFileTracingIncludes`** in `next.config.ts` bundles `src/lib/compiler/prompts/*.md` into serverless output — if you move prompt files, update this config
- **vercel.json route timeouts** — `/api/compile`: 60s, `/api/feedback`: 10s, `/api/feynman-eval`: 15s. Adjust if adding long-running routes
- **3 LLM vendors** — DeepSeek (primary, OpenAI-compat), GLM (智谱, coding-plan endpoint), SenseNova (商汤, token channel). Each has defaults in `providers/<name>.ts`
- **Quiz failure threshold** — 20% of quiz slots fail → entire compile aborts. Below → degraded silently (failed slots dropped)
- **`tsconfig.json` excludes** `.omo`, `docs`, `references` — these are documentation/workflow dirs, not compiled
- **Docs hierarchy** — Product-Specification.md (WHY/philosophy) → PRD.md (WHAT/scope) → Technical-Specification.md (HOW/architecture). Milestone reviews in `docs/M*-Review.md`
