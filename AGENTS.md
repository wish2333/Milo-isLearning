# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-18
**Commit:** (pending — v2.0.0 session)
**Branch:** feat/v2.0.0
**Docs version:** v2.0.0 (localhost production reliability + FSRS derived cache + AI expand pipeline + client search) — v0.1.0 archive below `docs/v0.1.0/`, v1.0.0/v1.1.0/v1.2.0 in respective dirs
**Latest milestone:** V2.0.0 个人记忆闭环与客户端搜索 (2026-07-17) — see `docs/v2.0.0/v2.0.0-Review.md`

## OVERVIEW

`ai-learning-compiler` — Next.js 15 + React 19 app that "compiles" raw Markdown into structured interactive learning modules (concepts → laddered quizzes → Feynman teach-back). LLM-driven 8-stage pipeline, Chinese-first. Ships in **two build modes** controlled by `NEXT_PUBLIC_APP_MODE`:

- **`showcase`** (default) — zero-backend demo. LocalStorage-only, mock-compile events, showcase题库 shipped under `public/showcase-modules/`. API routes fall back to server-side env LLM config when no BYOK key is set.
- **`production`** — SQLite-backed (`ALC_STORAGE_BACKEND=sqlite`). Server-side KV + client write-queue, legacy-LS→SQLite migration flow, real LLM compile. V2.0.0 adds auto-backup + integrity_check + FSRS derived cache + AI expand compile mode + client search.

See `src/lib/compiler/AGENTS.md` for the compiler subsystem.

## STRUCTURE

```
.
├── src/
│   ├── app/                       # Next.js App Router: pages + API routes
│   │   ├── api/                   # 13 routes across 4 namespaces
│   │   │   ├── compile/             # SSE streaming endpoint (core; V2 adds expand mode)
│   │   │   ├── feedback/            # Answer feedback agent (env-fallback aware)
│   │   │   ├── feynman-eval/        # Feynman step-6 scoring (env-fallback aware)
│   │   │   ├── regenerate/          # Retry quiz replacement
│   │   │   ├── env-config/          # Proxy .env.local keys to client
│   │   │   ├── ping/                # Provider health check
│   │   │   ├── migrate/             # LS→SQLite migration (5 routes: session/staging/commit/cancel/source-snapshot) — production mode only
│   │   │   └── backup/              # ★ V2.0.0 auto (POST force/24h) + verify (GET PRAGMA integrity_check) — production mode only
│   │   ├── learn/                 # 12-page learning journey (import→compile→overview→module→done + library + history + topic/[topicId] + review/[moduleId] + review/topic/[topicId] + today + today/review + stats)
│   │   ├── studio/                # Showcase-only studio entry (`/studio` + `/studio/settings`)
│   │   ├── settings/              # Unified settings page (mode-dispatched inside; V2 adds FSRS + 备份验证区)
│   │   ├── layout.tsx             # Root layout w/ SEO metadata (OG/Twitter/icons/robots)
│   │   ├── error.tsx              # App router error boundary
│   │   └── page.tsx               # Home — dispatches ShowcaseHome vs ProductionHome by APP_MODE
│   ├── components/
│   │   ├── home/                  # ProductionHome + ShowcaseHome (mode-dispatched; V2 Today smart routing)
│   │   ├── showcase/              # ShowcaseMode UI: MockCompileOverlay, ShowcaseModuleCard, ShowcaseTopicCard
│   │   ├── settings/              # ProductionSettings + ShowcaseSettings + DataManagement + StorageStatsSection
│   │   ├── migration/             # MigrationOrchestrator + 4 sub-components (production mode only)
│   │   ├── library/               # 8 module/topic management components (ModuleLibraryList, ModuleSwitcher, ModuleImportExport, QualitySummary, TopicCard, TopicCreator, TopicSection, UngroupedSection, IgnoredQuizSection F43)
│   │   ├── learn/                 # 18 learning-flow components (state-machine driven + Review* + Rating* + TopicTransitionView + KnowledgePageView + TodayReviewView)
│   │   ├── quiz/                  # 4 quiz renderers + FeedbackPanel (choice/sorting/fill_blank) — FeedbackPanel now supports 蒙对撤销
│   │   ├── search/                # ★ V2.0.0 SearchDialog (Cmd/Ctrl+K, opens-then-rebuilds ClientSearchIndex)
│   │   ├── AppShell.tsx / GlobalNav.tsx / LearnNavTop.tsx  # Layout chrome (GlobalNav now has Today + Search entries)
│   │   ├── StorageStatus.tsx / StorageLoading.tsx / StorageError.tsx  # SSR hydration guards; StorageStatus supports per-task retry
│   │   └── EnvConfigLoader.tsx    # Bootstraps client LLM config from /api/env-config
│   ├── lib/
│   │   ├── compiler/              # ★ Knowledge Compiler (see its own AGENTS.md). V2 adds `compile-with-expand.ts` + KnowledgeExpander agent
│   │   ├── providers/             # LLM abstraction: factory + OpenAI-compat base + 2 vendors (deepseek/glm) + generic openai-compat + env-fallback helper
│   │   ├── runtime/               # Pure business logic: evaluate-answer, mastery, retry-policy, adaptive-sequencer, fill-blank, semantic-evaluation, app-mode, topic-review, analytics, ★ fsrs{,-replay,-migrate,-schedule-coordinator}, content-revision, streak, stats-compute, search-client
│   │   ├── persistence/           # Storage layer (mode-dispatched)
│   │   │   ├── *.ts               # Domain repos: module-library, module-package, topic-library, topic-package, wrong-question-book, quota, migration, backup-package, ★ schedule-library
│   │   │   ├── shared/            # ★ Shared key/repository abstractions: keys, namespace, repository
│   │   │   ├── server/            # Server-side SQLite (better-sqlite3): db-singleton, sqlite-repository, schema, events-repo, backup (+ auto-backup, backup-verify), compile-checkpoint, migration-staging, migration-logs, config
│   │   │   └── client/            # Client-side storage (production mode): client-fetch-storage, write-queue (V2 lastError/failedAt + retryOne), flush-manager, zustand-storage-adapter, storage-initializer, legacy-local-storage-scanner, storage, local-storage, ★ auto-backup-trigger
│   │   ├── showcase/              # Showcase loader + mock-compile-events (no LLM, plays SSE recording)
│   │   ├── state/                 # 10 Zustand stores (see CODE MAP)
│   │   └── hooks/                 # useHydrated (SSR guard for Zustand persist)
│   └── types/
│       └── domain.ts              # ALL domain models. V2 adds: SchedulingData, StudyStreak, Concept.knowledgePage/sourceAnchorId, ModuleStage 'concept_intro', ReviewFilter 'due'
├── docs/
│   ├── v0.1.0/                    # Archived: V1.0 PRD + all development docs (M1–M7.6)
│   ├── v1.0.0/                    # V2.0 PRD + M7.8/M8/M8.1/M8.2/M8.3/V1.0.0 plans+reviews + Deploying.md + Showcase-Guide.md
│   ├── v1.1.0/                    # v1.0.1/v1.1.0/v1.1.1 plans+reviews
│   ├── v1.2.0/                    # v1.2.0 plan + review (deployment gate + quiz editing completion) + Showcase.alc-{module,topic}.json
│   └── v2.0.0/                    # ★ Current: v2.0.0 plan/design/review + Deploying-Localhost.md
├── public/
│   └── showcase-modules/          # Static showcase题库: manifest.json + mao-work-methods.alc-module.json + showcase-das-kapital.alc-topic.json
├── scripts/                       # Bun CLI: ping.ts, prompt-eval.ts, m3-smoke.ts, render-og.ts
├── e2e/                           # Playwright tests (workers=1, fullyParallel=false): smoke, library, topic, api-data, storage-layer, showcase/{home,v1-regression}
└── references/                    # Session notes/external references
```

## WHERE TO LOOK

| Task                           | Location                                                                                                                                                         | Notes                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand domain model        | `src/types/domain.ts`                                                                                                                                            | Single source of truth — read first. V2 adds SchedulingData, StudyStreak, Concept.knowledgePage/sourceAnchorId, ModuleStage 'concept_intro', ReviewFilter 'due' |
| Trace compile flow             | `src/lib/compiler/AGENTS.md` → `pipeline/pipeline.ts:88`                                                                                                         | `compileMarkdown()` async generator. V2 adds `compile-with-expand.ts` (AI 扩充独立 pipeline)                                                                    |
| Add API route                  | `src/app/api/<name>/route.ts`                                                                                                                                    | Stateless proxy to LLM; vercel.json sets `maxDuration`                                                                                                          |
| Change quiz rendering          | `src/components/quiz/QuizRenderer.tsx`                                                                                                                           | Dispatches by `interactionType`                                                                                                                                 |
| Modify learning state machine  | `src/lib/state/progress-store.ts` + `domain.ts` `ModuleStage`                                                                                                    | Discriminated union — illegal transitions = compile error. V2 adds `'concept_intro'` stage (AI 扩充知识页)                                                      |
| Add LLM provider               | `src/lib/providers/`                                                                                                                                             | Factory + `createProvider()` switch; exhaustive `never` check                                                                                                   |
| Server-side LLM fallback       | `src/lib/providers/env-fallback.ts`                                                                                                                              | `getEnvLLMConfig()` — used by `/api/feedback` + `/api/feynman-eval` when client BYOK is null                                                                    |
| Evaluate user answer           | `src/lib/runtime/evaluate-answer.ts`                                                                                                                             | Choice/Sorting=exact; FillBlank=normalized→semantic LLM fallback                                                                                                |
| Access LocalStorage            | `src/lib/persistence/shared/repository.ts` (iface) → `client/local-storage.ts` (impl)                                                                            | NEVER use `localStorage` directly. V2 refactored shared abstractions into `persistence/shared/`                                                                 |
| Storage key naming             | `src/lib/persistence/shared/keys.ts`                                                                                                                             | All keys via `StorageKeys` obj, `alc:` prefix. V2 adds `alc:schedule:*` / `alc:streak`                                                                          |
| App mode (showcase/production) | `src/lib/runtime/app-mode.ts`                                                                                                                                    | Build-time `APP_MODE` constant from `NEXT_PUBLIC_APP_MODE`                                                                                                      |
| Production storage backend     | `src/lib/persistence/client/`                                                                                                                                    | Fetch-based w/ write-queue + flush-manager; only when `ALC_STORAGE_BACKEND=sqlite`                                                                              |
| LS→SQLite migration            | `src/lib/persistence/migration.ts` + `/api/migrate/*` + `components/migration/`                                                                                  | 7-phase flow (scan→snapshot→session→upload→commit→reload→done); production mode only                                                                            |
| Auto-backup + integrity check  | `src/lib/persistence/server/{auto-backup,backup-verify}.ts` + `/api/backup/{auto,verify}` + `client/auto-backup-trigger.ts`                                      | ★ V2: reuses `createSnapshot` (VACUUM INTO); 24h threshold + force on module done; Settings 验证按钮                                                            |
| Showcase mode UI               | `src/lib/showcase/` + `components/home/ShowcaseHome.tsx` + `components/showcase/`                                                                                | `loadShowcaseManifest()` + `playMockCompileEvents()` (no real LLM)                                                                                              |
| Topic system                   | `src/types/domain.ts` `Topic`/`TopicSession` + `persistence/topic-library.ts` + `state/topic-session-store.ts` + `app/learn/topic/[topicId]/page.tsx`            | A topic = ordered list of modules; modules may belong to ≤1 topic                                                                                               |
| Wrong-question book            | `src/lib/persistence/wrong-question-book.ts`                                                                                                                     | Cross-library aggregation; feeds `/learn/review/[moduleId]` and `/learn/review/topic/[topicId]`                                                                 |
| Spaced repetition toggle       | `src/lib/state/settings-store.ts` `confirmReviewEnabled` + `progress-store.ts`                                                                                   | Default `true`; when off, `collectConfirmSlots` is skipped                                                                                                      |
| **FSRS derived schedule**      | `runtime/fsrs.ts` + `fsrs-replay.ts` + `fsrs-schedule-coordinator.ts` + `fsrs-migrate.ts` + `persistence/schedule-library.ts` + `state/settings-store.ts` `fsrs` | ★ V2: attempts 是真值，schedule 是可重放缓存；`synchronizeScheduleForSlot` 是协调层入口；`rebuildScheduleForSlot` 全量重放；参数变更触发全量回填                |
| **Today review & stats**       | `app/learn/today/page.tsx` + `app/learn/today/review/page.tsx` + `app/learn/stats/page.tsx` + `runtime/{streak,stats-compute}.ts`                                | ★ V2: 浏览器本地时区判定 due；TodaySession 持久化；`/learn/today` → 按模块分组的 due 列表 + streak                                                              |
| **Client search**              | `runtime/search-client.ts` + `components/search/SearchDialog.tsx` + `components/GlobalNav.tsx` (Cmd/Ctrl+K)                                                      | ★ V2: 打开时从当前 storage 重建索引 (rebuild-on-open)；中文子串 + 纯文本 snippet；不分模式共用                                                                  |
| **AI 扩充导入 (X1)**           | `compiler/agents/knowledge-expander.ts` + `compiler/pipeline/compile-with-expand.ts` + `components/learn/KnowledgePageView.tsx`                                  | ★ V2: expand → compile → anchor ID 精确回填；未匹配 anchor 保留 warning；`concept_intro` 状态机                                                                 |
| 蒙对标注 (guessed self-report) | `src/lib/state/attempts-store.ts` `markGuessed`/`unmarkGuessed` + `components/quiz/FeedbackPanel.tsx`                                                            | Unmark = destructure field removal (not set to false). V2: 蒙对→Hard 影响 FSRS schedule                                                                         |
| Quiz editing (F40+F42)         | `src/components/quiz/AnswerCorrector.tsx` + `FeedbackPanel.tsx` `onCorrectAnswer`                                                                                | `QuizEditPatch` type = widened `Partial<Pick<Quiz, ...>>`; 3 editors by interactionType; "编辑此题" button. V2: 纠题后 schedule 全量重放 (contentRevision 变更) |
| Ignored quiz management (F43)  | `src/components/library/IgnoredQuizSection.tsx` + `/learn/library`                                                                                               | Scans `alc:module:*` for `ignored===true`; grouped by module; batch restore via `correctQuizAnswer`. V2: ignore→schedule remove, restore→rebuild                |
| Topic skip (F24)               | `src/types/domain.ts` `ModuleTopicStatus` + `topic-session-store.ts`                                                                                             | 4th status `'skipped'`; `skipCurrentModule()` + `reenterModule()`; `TopicProgress.skippedModuleIds` persist                                                     |
| LLM config / API key           | `src/lib/state/settings-store.ts`                                                                                                                                | Stored in LocalStorage; `.env.local` keys auto-loaded via `/api/env-config`. V2: adds `fsrs` config block                                                       |
| SEO metadata                   | `src/app/layout.tsx`                                                                                                                                             | openGraph + twitter + icons + robots                                                                                                                            |
| Product requirements           | `docs/v1.0.0/PRD.md`                                                                                                                                             | MoSCoW priorities, FR-01~FR-12 (V2.0). FR-09 = 蒙对, FR-10 = 错题本导出, FR-11 = 重刷错题, FR-12 = 间隔重复                                                     |
| Architecture decisions         | `docs/v0.1.0/Technical-Specification.md`                                                                                                                         | §3 Providers, §5 Runtime, §6.2 Store split (legacy, pre-SQLite). V2 决策见 `docs/v2.0.0/v2.0.0-Review.md` §2                                                    |
| Design tokens / theme          | `src/app/globals.css`                                                                                                                                            | Dark-only; CSS custom properties; `alc-*` utility classes                                                                                                       |

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

### FSRS derived schedule (v2.0.0)

| Symbol                                                     | Type | Location                               | Role                                                                                                                  |
| ---------------------------------------------------------- | ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `rebuildScheduleForSlot`                                   | fn   | `runtime/fsrs-replay.ts`               | Pure: full replay from `AttemptRecord[]`; null when empty. Writes contentRevision/configRevision/lastAppliedAttemptId |
| `synchronizeScheduleForSlot`                               | fn   | `runtime/fsrs-schedule-coordinator.ts` | Coordinator entrypoint called by all attempt mutations; passes module/concept/quiz context → set/remove schedule      |
| `createSchedule` / `applyRating` / `inferRating` / `isDue` | fn   | `runtime/fsrs.ts`                      | ts-fsrs@5.4.1 (FSRS-6) wrapper; inferRating: <80→Again / guessed→Hard / <5s→Easy / else Good                          |
| `computeContentRevision` / `computeConfigRevision`         | fn   | `runtime/content-revision.ts`          | cyrb53-based stable hash (browser-safe); detects quiz edit / FSRS param change → triggers full replay                 |
| `rebuildSchedulesOnBoot`                                   | fn   | `runtime/fsrs-migrate.ts`              | First-boot + param-change full backfill; scans Module → concept → slot; no one-shot migrationFlag                     |
| `scheduleLibrary`                                          | repo | `persistence/schedule-library.ts`      | get/set/remove/listByModule/listDueBefore/listAll/clearAll via `storage` singleton                                    |
| `collectDueSlots`                                          | fn   | `runtime/adaptive-sequencer.ts`        | New: queries schedule-library for today's due (browser-local TZ); `ReviewFilter` adds `'due'`                         |

### Today review & stats (v2.0.0)

| Symbol              | Type | Location                   | Role                                                                                                             |
| ------------------- | ---- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `updateStreak`      | fn   | `runtime/streak.ts`        | `lastStudyDate===today→same` / `===yesterday→+1` / `else→1`; `longestStreak = max(...)`; called after addAttempt |
| `computeStats`      | fn   | `runtime/stats-compute.ts` | Pure: today due/done, streak, 7-day accuracy, totals; no recharts (pure CSS bars)                                |
| TodaySession        | type | `types/domain.ts`          | Persisted snapshot of due queue + per-round accuracy; `/learn/today` → `/learn/today/review` flow                |
| `startTodaySession` | fn   | `app/learn/today/page.tsx` | Snapshots current due queue + todayLocal, persists, routes to `/learn/today/review`                              |

### Client search (v2.0.0)

| Symbol              | Type | Location                             | Role                                                                                                             |
| ------------------- | ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `ClientSearchIndex` | cls  | `runtime/search-client.ts`           | In-memory index: module/concept/knowledgePage/quiz fields; Chinese substring + tokenization; plain-text snippet  |
| `SearchDialog`      | cmp  | `components/search/SearchDialog.tsx` | Cmd/Ctrl+K overlay; rebuilds index on open (no write-subscription); React-highlight (no dangerouslySetInnerHTML) |

### AI 扩充 pipeline (v2.0.0, X1)

| Symbol                   | Type  | Location                                   | Role                                                                                                   |
| ------------------------ | ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `compileWithExpand`      | fn*   | `compiler/pipeline/compile-with-expand.ts` | Independent pipeline: expand → compileMarkdown(normalizedSource) → backfillKnowledgePages by anchor ID |
| `KnowledgeExpander`      | agent | `compiler/agents/knowledge-expander.ts`    | LLM agent generating ExpandedKnowledge pages with stable `sourceAnchorId`                              |
| `backfillKnowledgePages` | fn    | `compiler/pipeline/compile-with-expand.ts` | Matches by `concept.sourceAnchorId` (exact); unmatched → warning, not silently dropped                 |
| `KnowledgePageView`      | cmp   | `components/learn/KnowledgePageView.tsx`   | Display + edit mode (textarea) + "AI 生成" badge + skip; edits via `module-store.updateKnowledgePage`  |
| `concept_intro`          | stage | `types/domain.ts` `ModuleStage`            | New optional stage: show knowledge page before quiz when present                                       |

### Backup & integrity (v2.0.0)

| Symbol               | Type  | Location                                    | Role                                                                                                 |
| -------------------- | ----- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `shouldBackup`       | fn    | `persistence/server/auto-backup.ts`         | 24h threshold check vs last snapshot mtime                                                           |
| `/api/backup/auto`   | route | `app/api/backup/auto/route.ts`              | POST `{ force?: boolean }`: force on module done, 24h gate on attempt write; production only         |
| `/api/backup/verify` | route | `app/api/backup/verify/route.ts`            | GET: reads latest `.db` snapshot, runs `PRAGMA integrity_check`, returns `{ valid, integrityCheck }` |
| `triggerAutoBackup`  | fn    | `persistence/client/auto-backup-trigger.ts` | Client hook: flushNow() first, then POST `/api/backup/auto`; aborts if failed tasks exist            |
| `retryOne`           | fn    | `persistence/client/write-queue.ts`         | V2: per-task retry (replaces clearFailed); WriteTask adds `lastError`/`failedAt`                     |

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
- **★ FSRS attempts 是真值，schedule 是可重放缓存 (V2)** — `scheduleLibrary` 始终维护(`fsrs.enabled` 只决定 Today/due 是否消费),但 `rebuildScheduleForSlot` 可随时从 `AttemptRecord[]` 全量重建。所有 attempt 变更经 `synchronizeScheduleForSlot` 协调层入口同步。`contentRevision`/`configRevision`/`lastAppliedAttemptId` 用于检测缓存过期。参数变更触发首次启动/参数变更时的全量回填(无一次性 migrationFlag)
- **★ AI 扩充独立 pipeline (V2)** — `compileWithExpand`:expand → `compileMarkdown`(normalized source)→ `backfillKnowledgePages` 按 `concept.sourceAnchorId` **精确** ID 匹配(非名称模糊匹配);未匹配 anchor 保留为 warning,不静默丢弃。`concept_intro` 是可选 stage:有 `knowledgePage` 的 concept 先展示知识页再做题
- **★ 客户端搜索 rebuild-on-open (V2)** — 不加 `/api/search`、SQLite FTS5 或多写入点订阅;`SearchDialog` 打开时从当前 mode 的 storage 读取并重建 `ClientSearchIndex`。单人 localhost 场景足够,production/showcase 共用同一索引逻辑(只替换 storage 实现)。文本高亮用 react-highlight,**禁止** `dangerouslySetInnerHTML`。搜索遵循 `ContentOrigin` 隔离
- **★ 自动备份 flushNow 先行 (V2)** — 客户端触发备份前必须 `await repo.flushNow()` 且无 failed tasks(否则 `triggerAutoBackup` 直接 abort)。module 完成 → `force: true` 强制备份;attempt 写入 → 24h 阈值检查。复用 `createSnapshot`(VACUUM INTO 一致性快照)+ 既有 10 份轮转。**永远不直接复制正在写入的 SQLite 主文件**作为备份,只走应用自动快照流程
- **★ FSRS rating 推断 (V2)** — `inferRating`: `<80→Again` / `guessed===true→Hard` / `timeSpentMs<5000→Easy` / else `Good`。蒙对标注会通过 Hard 路径影响 stability(比 Good 低),让"蒙对"自然反映到复习频率上

## GIT 提交与批次工作流

- **批次提交** — 按 v2.0.0 plan 拆分 subagent 后，子代理只负责实现与验证，不单独提交；根代理完成整批 code review、测试和构建后，每批统一创建一次提交。
- **提交标题风格** — 沿用仓库既有的中文 Conventional Commit 风格：功能使用 `feat: 完成 ...`，修复使用 `fix: 修正 ...`，文档使用 `docs: 新增 ...` 或 `docs: 完善 ...`，测试使用 `test: ...`。除非历史上下文明确要求，不新增英文 scope 风格。
- **历史重写** — 只有用户明确要求时，才重写本地且未共享的提交标题；只改 message，不改变提交内容。已推送或多人共享的历史默认不重写。

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
bun run test             # vitest run (unit, node env) — 749 tests as of V2.0.0
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

See `docs/v1.0.0/Deploying.md` for full deployment guide. V2.0.0 localhost production 部署见 `docs/v2.0.0/Deploying-Localhost.md`。

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
- **Docs hierarchy** — Product-Specification.md (WHY/philosophy, archived in v0.1.0) → `docs/v1.0.0/PRD.md` (WHAT/scope, V2.0) → `docs/v0.1.0/Technical-Specification.md` (HOW/architecture, pre-SQLite legacy). Milestone plans+reviews in `docs/v1.0.0/M{7.8,8,8.1,8.2,8.3}-{Plan,Review}.md` and `docs/v1.0.0/v1.0.0-{plan,report}.md` + `V1.0.0-Review.md`. V2.0.0 plan/design/review in `docs/v2.0.0/`,localhost 部署见 `docs/v2.0.0/Deploying-Localhost.md`
- **Showcase content lives in `public/showcase-modules/`** — `manifest.json` enumerates available `.alc-module.json` / `.alc-topic.json` files. Authoritative copies also kept under `docs/v1.0.0/Showcase.alc-*` for reference; the `public/` copies are what the running app reads
- **Topic system is M8.1** — a `Topic` is an ordered list of `moduleIds`. Each module may belong to ≤1 topic (UI-enforced). Deleting a topic leaves its modules orphaned (un-grouped), not deleted
- **Migration is irreversible** — once LS data is committed to SQLite and the client marker is written, re-running `runMigration` skips migrated entries. Backup snapshots are saved server-side as `alc-ls-snapshot-*.json`
