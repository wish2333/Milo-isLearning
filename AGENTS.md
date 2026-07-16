# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-16
**Commit:** (pending — v1.2.0 session)
**Branch:** feat/v1.0.0-mvp-polish
**Docs version:** v1.2.0 (deployment gate + quiz editing completion) — v0.1.0 archive below `docs/v0.1.0/`, v1.0.0/v1.1.0 in respective dirs
**Latest milestone:** V1.2.0 部署就绪与题库编辑闭环 (2026-07-16) — see `docs/v1.2.0/v1.2.0-Review.md`

## OVERVIEW

`ai-learning-compiler` — Next.js 15 + React 19 app that "compiles" raw Markdown into structured interactive learning modules (concepts → laddered quizzes → Feynman teach-back). LLM-driven 8-stage pipeline, Chinese-first. Ships in **two build modes** controlled by `NEXT_PUBLIC_APP_MODE`:

- **`showcase`** (default) — zero-backend demo. LocalStorage-only, mock-compile events, showcase题库 shipped under `public/showcase-modules/`. API routes fall back to server-side env LLM config when no BYOK key is set.
- **`production`** — SQLite-backed (`ALC_STORAGE_BACKEND=sqlite`). Server-side KV + client write-queue, legacy-LS→SQLite migration flow, real LLM compile.

See `src/lib/compiler/AGENTS.md` for the compiler subsystem.

## STRUCTURE

```
.
├── src/
│   ├── app/                       # Next.js App Router: pages + API routes
│   │   ├── api/                   # 11 routes across 2 namespaces
│   │   │   ├── compile/             # SSE streaming endpoint (core)
│   │   │   ├── feedback/            # Answer feedback agent (env-fallback aware)
│   │   │   ├── feynman-eval/        # Feynman step-6 scoring (env-fallback aware)
│   │   │   ├── regenerate/          # Retry quiz replacement
│   │   │   ├── env-config/          # Proxy .env.local keys to client
│   │   │   ├── ping/                # Provider health check
│   │   │   └── migrate/             # ★ LS→SQLite migration (5 routes: session/staging/commit/cancel/source-snapshot) — production mode only
│   │   ├── learn/                 # 9-page learning journey (import→compile→overview→module→done + library + history + topic/[topicId] + review/[moduleId] + review/topic/[topicId])
│   │   ├── studio/                # Showcase-only studio entry (`/studio` + `/studio/settings`)
│   │   ├── settings/              # Unified settings page (mode-dispatched inside)
│   │   ├── layout.tsx             # Root layout w/ SEO metadata (OG/Twitter/icons/robots)
│   │   ├── error.tsx              # App router error boundary
│   │   └── page.tsx               # Home — dispatches ShowcaseHome vs ProductionHome by APP_MODE
│   ├── components/
│   │   ├── home/                  # ProductionHome + ShowcaseHome (mode-dispatched)
│   │   ├── showcase/              # ShowcaseMode UI: MockCompileOverlay, ShowcaseModuleCard, ShowcaseTopicCard
│   │   ├── settings/              # ProductionSettings + ShowcaseSettings + DataManagement + StorageStatsSection
│   │   ├── migration/             # ★ MigrationOrchestrator + 4 sub-components (production mode only)
│   │   ├── library/               # 8 module/topic management components (ModuleLibraryList, ModuleSwitcher, ModuleImportExport, QualitySummary, TopicCard, TopicCreator, TopicSection, UngroupedSection, IgnoredQuizSection F43)
│   │   ├── learn/                 # 16 learning-flow components (state-machine driven + Review* + Rating* + TopicTransitionView)
│   │   ├── quiz/                  # 4 quiz renderers + FeedbackPanel (choice/sorting/fill_blank) — FeedbackPanel now supports 蒙对撤销
│   │   ├── AppShell.tsx / GlobalNav.tsx / LearnNavTop.tsx  # Layout chrome
│   │   ├── StorageStatus.tsx / StorageLoading.tsx / StorageError.tsx  # SSR hydration guards
│   │   └── EnvConfigLoader.tsx    # Bootstraps client LLM config from /api/env-config
│   ├── lib/
│   │   ├── compiler/              # ★ Knowledge Compiler (see its own AGENTS.md)
│   │   ├── providers/             # LLM abstraction: factory + OpenAI-compat base + 2 vendors (deepseek/glm) + generic openai-compat + env-fallback helper
│   │   ├── runtime/               # Pure business logic: evaluate-answer, mastery, retry-policy, adaptive-sequencer, fill-blank, semantic-evaluation, app-mode, topic-review, analytics
│   │   ├── persistence/           # Storage layer (mode-dispatched)
│   │   │   ├── *.ts               # Domain repos: module-library, module-package, topic-library, topic-package, wrong-question-book, quota, migration, backup-package
│   │   │   └── client/            # ★ Client-side storage (production mode): client-fetch-storage, write-queue, flush-manager, zustand-storage-adapter, storage-initializer, legacy-local-storage-scanner, storage, local-storage
│   │   ├── showcase/              # ★ Showcase loader + mock-compile-events (no LLM, plays SSE recording)
│   │   ├── state/                 # 10 Zustand stores (see CODE MAP)
│   │   └── hooks/                 # useHydrated (SSR guard for Zustand persist)
│   └── types/
│       └── domain.ts              # ALL domain models (Module, Concept, Quiz, ModuleStage, Mastery, Topic, TopicSession, ContentOrigin, ReviewFilter, etc.)
├── docs/
│   ├── v0.1.0/                    # Archived: V1.0 PRD + all development docs (M1–M7.6)
│   ├── v1.0.0/                    # V2.0 PRD + M7.8/M8/M8.1/M8.2/M8.3/V1.0.0 plans+reviews + Deploying.md + Showcase-Guide.md
│   ├── v1.1.0/                    # v1.0.1/v1.1.0/v1.1.1 plans+reviews
│   └── v1.2.0/                    # ★ Current: v1.2.0 plan + review (deployment gate + quiz editing completion) + Showcase.alc-{module,topic}.json
├── public/
│   └── showcase-modules/          # ★ Static showcase题库: manifest.json + mao-work-methods.alc-module.json + showcase-das-kapital.alc-topic.json
├── scripts/                       # Bun CLI: ping.ts, prompt-eval.ts, m3-smoke.ts, render-og.ts
├── e2e/                           # Playwright tests (workers=1, fullyParallel=false): smoke, library, topic, api-data, storage-layer, showcase/{home,v1-regression}
└── references/                    # Session notes/external references
```

## WHERE TO LOOK

| Task                           | Location                                                                                                                                              | Notes                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Understand domain model        | `src/types/domain.ts`                                                                                                                                 | Single source of truth — read first. New: Topic, TopicSession, ContentOrigin, ReviewFilter                  |
| Trace compile flow             | `src/lib/compiler/AGENTS.md` → `pipeline/pipeline.ts:88`                                                                                              | `compileMarkdown()` async generator                                                                         |
| Add API route                  | `src/app/api/<name>/route.ts`                                                                                                                         | Stateless proxy to LLM; vercel.json sets `maxDuration`                                                      |
| Change quiz rendering          | `src/components/quiz/QuizRenderer.tsx`                                                                                                                | Dispatches by `interactionType`                                                                             |
| Modify learning state machine  | `src/lib/state/progress-store.ts` + `domain.ts` `ModuleStage`                                                                                         | Discriminated union — illegal transitions = compile error                                                   |
| Add LLM provider               | `src/lib/providers/`                                                                                                                                  | Factory + `createProvider()` switch; exhaustive `never` check                                               |
| Server-side LLM fallback       | `src/lib/providers/env-fallback.ts`                                                                                                                   | `getEnvLLMConfig()` — used by `/api/feedback` + `/api/feynman-eval` when client BYOK is null                |
| Evaluate user answer           | `src/lib/runtime/evaluate-answer.ts`                                                                                                                  | Choice/Sorting=exact; FillBlank=normalized→semantic LLM fallback                                            |
| Access LocalStorage            | `src/lib/persistence/repository.ts` (iface) → `client/local-storage.ts` (impl)                                                                        | NEVER use `localStorage` directly                                                                           |
| Storage key naming             | `src/lib/persistence/keys.ts`                                                                                                                         | All keys via `StorageKeys` obj, `alc:` prefix                                                               |
| App mode (showcase/production) | `src/lib/runtime/app-mode.ts`                                                                                                                         | Build-time `APP_MODE` constant from `NEXT_PUBLIC_APP_MODE`                                                  |
| Production storage backend     | `src/lib/persistence/client/`                                                                                                                         | Fetch-based w/ write-queue + flush-manager; only when `ALC_STORAGE_BACKEND=sqlite`                          |
| LS→SQLite migration            | `src/lib/persistence/migration.ts` + `/api/migrate/*` + `components/migration/`                                                                       | 7-phase flow (scan→snapshot→session→upload→commit→reload→done); production mode only                        |
| Showcase mode UI               | `src/lib/showcase/` + `components/home/ShowcaseHome.tsx` + `components/showcase/`                                                                     | `loadShowcaseManifest()` + `playMockCompileEvents()` (no real LLM)                                          |
| Topic system                   | `src/types/domain.ts` `Topic`/`TopicSession` + `persistence/topic-library.ts` + `state/topic-session-store.ts` + `app/learn/topic/[topicId]/page.tsx` | A topic = ordered list of modules; modules may belong to ≤1 topic                                           |
| Wrong-question book            | `src/lib/persistence/wrong-question-book.ts`                                                                                                          | Cross-library aggregation; feeds `/learn/review/[moduleId]` and `/learn/review/topic/[topicId]`             |
| Spaced repetition toggle       | `src/lib/state/settings-store.ts` `confirmReviewEnabled` + `progress-store.ts`                                                                        | Default `true`; when off, `collectConfirmSlots` is skipped                                                  |
| 蒙对标注 (guessed self-report) | `src/lib/state/attempts-store.ts` `markGuessed`/`unmarkGuessed` + `components/quiz/FeedbackPanel.tsx`                                                 | Unmark = destructure field removal (not set to false)                                                       |
| Quiz editing (F40+F42)         | `src/components/quiz/AnswerCorrector.tsx` + `FeedbackPanel.tsx` `onCorrectAnswer`                                                                     | `QuizEditPatch` type = widened `Partial<Pick<Quiz, ...>>`; 3 editors by interactionType; "编辑此题" button  |
| Ignored quiz management (F43)  | `src/components/library/IgnoredQuizSection.tsx` + `/learn/library`                                                                                    | Scans `alc:module:*` for `ignored===true`; grouped by module; batch restore via `correctQuizAnswer`         |
| Topic skip (F24)               | `src/types/domain.ts` `ModuleTopicStatus` + `topic-session-store.ts`                                                                                  | 4th status `'skipped'`; `skipCurrentModule()` + `reenterModule()`; `TopicProgress.skippedModuleIds` persist |
| LLM config / API key           | `src/lib/state/settings-store.ts`                                                                                                                     | Stored in LocalStorage; `.env.local` keys auto-loaded via `/api/env-config`                                 |
| SEO metadata                   | `src/app/layout.tsx`                                                                                                                                  | openGraph + twitter + icons + robots                                                                        |
| Product requirements           | `docs/v1.0.0/PRD.md`                                                                                                                                  | MoSCoW priorities, FR-01~FR-12 (V2.0). FR-09 = 蒙对, FR-10 = 错题本导出, FR-11 = 重刷错题, FR-12 = 间隔重复 |
| Architecture decisions         | `docs/v0.1.0/Technical-Specification.md`                                                                                                              | §3 Providers, §5 Runtime, §6.2 Store split (legacy, pre-SQLite)                                             |
| Design tokens / theme          | `src/app/globals.css`                                                                                                                                 | Dark-only; CSS custom properties; `alc-*` utility classes                                                   |

## CODE MAP

Core symbols (highest centrality). Full compiler map → `src/lib/compiler/AGENTS.md`.

### Compiler & providers

| Symbol            | Type | Location                            | Role                                                      |
| ----------------- | ---- | ----------------------------------- | --------------------------------------------------------- |
| `compileMarkdown` | fn*  | `compiler/pipeline/pipeline.ts:88`  | Async generator: 8-stage compile, yields SSE events       |
| `consumeStream`   | fn   | `compiler/pipeline/pipeline.ts:810` | Wraps generator → `Promise<Module>`                       |
| `runAgent`        | fn   | `compiler/agents/_runner.ts:67`     | Universal LLM caller: prompt→chat→JSON→Zod→retry          |
| `createProvider`  | fn   | `providers/index.ts:43`             | Factory: dispatches deepseek/glm/openai-compat            |
| `getEnvLLMConfig` | fn   | `providers/env-fallback.ts`         | Build `LLMConfig` from `process.env.*`; null when missing |

### Runtime (pure business logic)

| Symbol                  | Type  | Location                        | Role                                                  |
| ----------------------- | ----- | ------------------------------- | ----------------------------------------------------- |
| `computeMastery`        | fn    | `runtime/mastery.ts`            | Pure: first-attempt pass rate + completion %          |
| `evaluateAnswer`        | fn    | `runtime/evaluate-answer.ts`    | Pure: deterministic scoring (semantic fallback async) |
| `buildAdaptiveQueue`    | fn    | `runtime/adaptive-sequencer.ts` | Reorders unseen/wrong/due slots                       |
| `buildTopicReviewQueue` | fn    | `runtime/topic-review.ts`       | Cross-module wrong-question queue for topic review    |
| `APP_MODE`              | const | `runtime/app-mode.ts:20`        | `'showcase' \| 'production'` — build-time literal     |
| `computeAnalytics`      | fn    | `runtime/analytics.ts`          | Learning analytics aggregation                        |

### State (10 Zustand stores)

| Symbol                 | Type  | Location                       | Role                                                                                           |
| ---------------------- | ----- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `useProgressStore`     | store | `state/progress-store.ts`      | State machine transitions + Feynman tracking + spaced-repetition gate                          |
| `useModuleStore`       | store | `state/module-store.ts`        | Current Module/Quiz; `replaceCurrentQuiz()` for retry; `correctQuizAnswer()` for F40/F42 edits |
| `useSettingsStore`     | store | `state/settings-store.ts`      | LLM config + `confirmReviewEnabled` toggle                                                     |
| `useAttemptsStore`     | store | `state/attempts-store.ts`      | Per-slot answer history; `markGuessed`/`unmarkGuessed`                                         |
| `useReviewStore`       | store | `state/review-store.ts`        | Wrong/guessed question review sessions                                                         |
| `useTopicSessionStore` | store | `state/topic-session-store.ts` | Topic刷题 session (persisted, refresh-resumable); F24: `skipCurrentModule()`/`reenterModule()` |
| `useRatingStore`       | store | `state/rating-store.ts`        | Module/star ratings                                                                            |
| `useRuntimeModeStore`  | store | `state/runtime-mode-store.ts`  | Runtime mode flags (non-persisted)                                                             |
| `useCompileJobStore`   | store | `state/compile-job-store.ts`   | Compile job tracking                                                                           |
| `useCompileStore`      | store | `state/compile-store.ts`       | Non-persisted compile SSE state                                                                |

### Showcase & migration

| Symbol                  | Type | Location                          | Role                                            |
| ----------------------- | ---- | --------------------------------- | ----------------------------------------------- |
| `loadShowcaseManifest`  | fn   | `showcase/showcase-loader.ts`     | Reads `public/showcase-modules/manifest.json`   |
| `playMockCompileEvents` | fn   | `showcase/mock-compile-events.ts` | Replay pre-recorded SSE for showcase compile UI |
| `runMigration`          | fn   | `persistence/migration.ts:56`     | 7-phase LS→SQLite migration orchestrator        |

### API entry points

| Symbol                  | Type   | Location                                                                   | Role                                              |
| ----------------------- | ------ | -------------------------------------------------------------------------- | ------------------------------------------------- |
| `compileMarkdown` (API) | route  | `app/api/compile/route.ts`                                                 | SSE endpoint consuming the pipeline generator     |
| `*` (migrate)           | routes | `app/api/migrate/{session,staging,commit,cancel,source-snapshot}/route.ts` | 5-route migration namespace; production mode only |

### Quiz editing & topic UX (v1.2.0)

| Symbol              | Type | Location                              | Role                                                                                                                                                                             |
| ------------------- | ---- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QuizEditPatch`     | type | `components/quiz/AnswerCorrector.tsx` | Widened `Partial<Pick<Quiz, 'answer' \| 'options' \| 'acceptableAnswers' \| 'stem' \| 'explanation' \| 'distractors' \| 'answerHint' \| 'ignored'>>`; shared across 4 call sites |
| `skipCurrentModule` | fn   | `state/topic-session-store.ts`        | F24: mark current module 'skipped', advance currentIndex, return next moduleId                                                                                                   |
| `reenterModule`     | fn   | `state/topic-session-store.ts`        | F24: revert module from 'skipped' to 'in_progress'                                                                                                                               |

## CONVENTIONS

- **Bun toolchain** — `bun run dev/test/build`. Scripts needing env: `bun --env-file=.env.local run scripts/*.ts`
- **Path alias** `@/*` → `./src/*`
- **Zustand everywhere** — 10 stores total. 9 persisted (`alc:state:*` / `alc:settings` keys) + 1 volatile (`compile-store`). Stores cross-ref via `.getState()`
- **Persist middleware** — `persist(createJSONStorage(() => localStorage))` in showcase mode; `zustand-storage-adapter` → fetch-storage in production mode. Guard SSR with `useHydrated()` hook
- **Build-time mode split** — `APP_MODE` is a build-time literal (`process.env.NEXT_PUBLIC_APP_MODE`). Default = `showcase`. Same code, two binaries; client/server must agree (so default is showcase on both)
- **ContentOrigin tagging** — `Module.origin` / `Topic.origin` = `'showcase' | 'user'`. Library pages filter by `APP_MODE`: showcase mode sees only `origin==='showcase'`, production mode sees only `origin!=='showcase'`
- **Production storage** — `ALC_STORAGE_BACKEND=sqlite` enables server-side KV + client write-queue/flush-manager. Without it, production mode API routes 404
- **Discriminated union state machine** — `ModuleStage.kind` field; illegal transitions caught at compile time
- **Exhaustive switch** — Provider dispatch uses `const _: never = x` pattern for compile-time coverage
- **Chinese-first** — comments, error messages, UI text, `lang="zh-CN"`. Not i18n; single locale
- **Design tokens** — colors/fonts via CSS custom properties in `globals.css`, NOT Tailwind defaults. `alc-*` classes for page layout
- **Dark-only** — no light theme. Warm amber accent (`#d4a574`), sage success (`#7fa88c`), muted terracotta danger (no bright red)
- **Serif-first body** — Fraunces + Source Han Serif SC (not typical sans-serif)
- **Two-model compile** — `lightweightModel` (import) vs `compileModel` (generation); cost optimization
- **Retry = quiz replacement** — failing generates a NEW quiz via `/api/regenerate`; state machine does NOT advance
- **Env fallback only in showcase** — `/api/feedback` + `/api/feynman-eval` use `getEnvLLMConfig()` only when client BYOK config is null. Production BYOK takes precedence
- **Migration is one-way** — LS→SQLite. No SQLite→LS path. Triggered only in production mode via UI prompt
- **SEO metadata centralized** — all OG/Twitter/icons/robots in `app/layout.tsx` metadata export, not per-page
- **OG image PNG** — `public/og-image.png` (1200×630) for social platforms; `og-image.svg` kept as source; re-render via `bun run og:render` (uses `sharp`)
- **Quiz editing (F42)** — `QuizEditPatch` type exported from `AnswerCorrector.tsx`; widening flows through `module-library.updateQuizInModule` → `module-store.correctQuizAnswer` → `FeedbackPanel.onCorrectAnswer` → `AnswerCorrector.onSave`. Edit is pure field patch, no re-compile/LLM call
- **Topic skip (F24)** — `ModuleTopicStatus` has 4 states (`pending`/`in_progress`/`done`/`skipped`). `allDone` = `done + skipped === total`. `TopicProgress.skippedModuleIds` persists across exit/resume. Skipped modules are re-enterable (status → `in_progress`)

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
- **NO SenseNova** — provider removed in M8 era. Use `deepseek` / `glm` / generic `openai-compat` only
- **NO showcase logic in production mode** — `isShowcaseMode` gates mock-compile, showcase loader, etc. Production mode MUST call real LLMs
- **NO migration code in showcase mode** — `runMigration()` throws if `isShowcaseMode`. `/api/migrate/*` returns 404 in showcase
- **NO mixing ContentOrigin** — showcase modules are immutable in production mode; user modules are invisible in showcase mode
- **NO per-page SEO metadata** — all OG/Twitter/icons centralized in `app/layout.tsx`
- **NO reading `.env.local`** — contains provider API keys (DEEPSEEK/GLM). Never `cat`/`read`/`grep` it. Keys are proxied to client via `/api/env-config`; use `settings-store.getLLMConfig()` at runtime
- **NO dismissing test warnings/failures as "pre-existing"** — EVERY warning and failure in any test run (unit/e2e/typecheck/lint/build) MUST be investigated and either fixed or explicitly justified with a concrete reason, never hand-waved away as "already broken before my change". If unrelated to the current change, state the root cause with evidence (file:line, failing assertion) and link/track it; do not silently skip. Pre-existing is a hypothesis to verify, not an excuse to ignore.

## COMMANDS

```bash
bun run dev              # Next.js dev server
bun run build            # Production build
bun run typecheck        # tsc --noEmit
bun run test             # vitest run (unit, node env) — 639 tests as of V1.2.0
bun run e2e              # playwright test (workers=1)
bun run lint             # eslint .
bun run format           # prettier --write .
bun run ping             # LLM provider health check
bun run eval             # Prompt evaluation framework
bun run og:render        # Re-render OG image PNG from SVG (uses sharp)
bun --env-file=.env.local run scripts/m3-smoke.ts  # End-to-end compile smoke
```

### Mode-specific build

```bash
# Showcase build (default — zero-backend demo)
NEXT_PUBLIC_APP_MODE=showcase bun run build

# Production build (requires SQLite backend wiring)
NEXT_PUBLIC_APP_MODE=production ALC_STORAGE_BACKEND=sqlite bun run build
```

See `docs/v1.0.0/Deploying.md` for full deployment guide.

### PR workflow

```bash
gh pr create --base main --head <branch> --title "feat: <summary>" --body-file <pr-body.md>
gh pr view <pr-number> --json mergeable,mergeStateStatus
gh pr merge <pr-number> --merge --admin   # bypass branch protection for admin repos
```

Tag workflow:

```bash
git tag <tag-name>
git push origin <tag-name> --force
```

See `.agents/skills/release-workflow/SKILL.md` for the full closeout pipeline (review doc → commit → PR → merge → tag).

## NOTES

- **`outputFileTracingIncludes`** in `next.config.ts` bundles `src/lib/compiler/prompts/*.md` into serverless output — if you move prompt files, update this config
- **vercel.json route timeouts** — `/api/compile`: 60s, `/api/feedback`: 10s, `/api/feynman-eval`: 15s. Adjust if adding long-running routes
- **3 LLM provider kinds** — DeepSeek (primary, OpenAI-compat), GLM (智谱, coding-plan endpoint), openai-compat (generic, BYO baseURL/apiKey). SenseNova was removed. Each kind has defaults in `providers/<name>.ts`
- **Quiz failure threshold** — 20% of quiz slots fail → entire compile aborts. Below → degraded silently (failed slots dropped)
- **`tsconfig.json` excludes** `.omo`, `docs`, `references` — these are documentation/workflow dirs, not compiled
- **Docs hierarchy** — Product-Specification.md (WHY/philosophy, archived in v0.1.0) → `docs/v1.0.0/PRD.md` (WHAT/scope, V2.0) → `docs/v0.1.0/Technical-Specification.md` (HOW/architecture, pre-SQLite legacy). Milestone plans+reviews in `docs/v1.0.0/M{7.8,8,8.1,8.2,8.3}-{Plan,Review}.md` and `docs/v1.0.0/v1.0.0-{plan,report}.md` + `V1.0.0-Review.md`
- **Showcase content lives in `public/showcase-modules/`** — `manifest.json` enumerates available `.alc-module.json` / `.alc-topic.json` files. Authoritative copies also kept under `docs/v1.0.0/Showcase.alc-*` for reference; the `public/` copies are what the running app reads
- **Topic system is M8.1** — a `Topic` is an ordered list of `moduleIds`. Each module may belong to ≤1 topic (UI-enforced). Deleting a topic leaves its modules orphaned (un-grouped), not deleted
- **Migration is irreversible** — once LS data is committed to SQLite and the client marker is written, re-running `runMigration` skips migrated entries. Backup snapshots are saved server-side as `alc-ls-snapshot-*.json`
