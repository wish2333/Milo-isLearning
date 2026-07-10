# M8 Review — Showcase Mode & Public Demo

**日期：** 2026-07-10
**分支：** main
**依据计划：** `docs/v1.0.0/M8-Plan.md`

---

## 1. 已实现任务清单

| Task | 内容 | 状态 |
|------|------|------|
| Task 1 | 环境变量基础设施 — `app-mode.ts` + `EnvConfigLoader` `enabled` prop | ✅ |
| Task 2 | 展示题库静态资源 — `manifest.json` + `showcase-loader.ts` + 9 unit tests | ✅ |
| Task 3 | 展示首页 — `ProductionHome` 抽取 + `ShowcaseHome` + `ShowcaseModuleCard` + `page.tsx` 条件渲染 | ✅ |
| Task 4 | 模拟编译 — `mock-compile-events.ts` (16 events) + `MockCompileOverlay` + ShowcaseHome 集成 + 7 unit tests | ✅ |
| Task 5 | 展示 Settings — `ProductionSettings` 抽取 + `ShowcaseSettings` 信息页 + `settings/page.tsx` 条件渲染 | ✅ |
| Task 6 | 根布局条件化 + `/studio` 路由 — `layout.tsx` 条件 `EnvConfigLoader` + `/studio` + `/studio/settings` | ✅ |
| Task 7 | 导航适配 — `GlobalNav` 展示模式隐藏「导入新内容」 | ✅ |
| Task 8 | 供应商重构 — `ProviderKind` `sensenova` → `openai-compat`，默认供应商改为 `deepseek`，全量 typecheck 修正 | ✅ |

---

## 2. 新增文件

| 文件 | 用途 |
|------|------|
| `src/lib/runtime/app-mode.ts` | 构建时模式判定（`isShowcaseMode` / `isProductionMode`） |
| `src/lib/runtime/__tests__/app-mode.test.ts` | 默认模式测试 |
| `src/lib/showcase/showcase-loader.ts` | 展示题库 fetch / parse / import 加载器 |
| `src/lib/showcase/__tests__/showcase-loader.test.ts` | 加载器单元测试（9 tests） |
| `src/lib/showcase/mock-compile-events.ts` | 合成 `CompileEvent` 序列生成器 |
| `src/lib/showcase/__tests__/mock-compile-events.test.ts` | 事件生成器测试（7 tests） |
| `src/components/home/ProductionHome.tsx` | 实用首页（从 page.tsx 抽取） |
| `src/components/home/ShowcaseHome.tsx` | 展示首页（题库列表 + 模拟编译状态机） |
| `src/components/showcase/ShowcaseModuleCard.tsx` | 展示题库卡片组件 |
| `src/components/showcase/MockCompileOverlay.tsx` | 模拟编译全屏动画（复用 `useCompileStore`） |
| `src/components/settings/ProductionSettings.tsx` | 实用 Settings（从 settings/page.tsx 抽取） |
| `src/components/settings/ShowcaseSettings.tsx` | 展示 Settings 纯信息页 |
| `src/app/studio/page.tsx` | `/studio` 实用首页路由 |
| `src/app/studio/settings/page.tsx` | `/studio/settings` 实用 Settings 路由 |
| `src/lib/providers/openai-compat-provider.ts` | OpenAI 兼容供应商工厂（替代 sensenova.ts） |
| `public/showcase-modules/manifest.json` | 展示题库清单 |
| `docs/v1.0.0/Showcase-Guide.md` | 展示题库添加指南 |

## 3. 修改文件

| 文件 | 变更 |
|------|------|
| `src/app/page.tsx` | `'use client'` → Server Component，条件渲染 ProductionHome / ShowcaseHome |
| `src/app/settings/page.tsx` | `'use client'` → Server Component，条件渲染 ProductionSettings / ShowcaseSettings |
| `src/app/layout.tsx` | 条件渲染 `EnvConfigLoader`（展示模式不挂载） |
| `src/components/EnvConfigLoader.tsx` | 新增 `enabled` prop（默认 `true`，双重保险） |
| `src/components/learn/GlobalNav.tsx` | 展示模式隐藏「导入新内容」入口 |
| `src/lib/providers/types.ts` | `ProviderKind`: `sensenova` → `openai-compat` |
| `src/lib/providers/index.ts` | Factory dispatch / exports / `isSupportedProvider` 更新 |
| `src/app/api/env-config/route.ts` | 默认供应商 `deepseek`，env vars `OPENAI_COMPAT_*` |
| `src/app/settings/page.tsx` → `ProductionSettings.tsx` | Provider 选择器 label "OpenAI 兼容"，baseURL 必填 |
| `scripts/ping.ts` / `prompt-eval.ts` / `m3-smoke.ts` | Provider 枚举 + 环境变量更新 |
| `docs/v1.0.0/Deploying.md` | 环境变量表更新 |

## 4. 删除文件

| 文件 | 原因 |
|------|------|
| `src/lib/providers/sensenova.ts` | 被 `openai-compat-provider.ts` 替代 |

---

## 5. 验证结果

| 命令 | 结果 |
|------|------|
| `bun run typecheck` | ✅ 0 errors |
| `bun run lint` | ✅ 0 errors |
| `bun run test` | ✅ 267 tests passed (21 test files) |
| `bun run build` | ✅ Build successful，`/studio` + `/studio/settings` 路由已注册 |

### 新增测试

| 测试文件 | 测试数 |
|----------|--------|
| `src/lib/runtime/__tests__/app-mode.test.ts` | 1 |
| `src/lib/showcase/__tests__/showcase-loader.test.ts` | 9 |
| `src/lib/showcase/__tests__/mock-compile-events.test.ts` | 7 |
| **合计新增** | **17 tests** |

---

## 6. 已知限制

### 6.1 展示题库尚未生成

`public/showcase-modules/manifest.json` 引用了 `intro-to-alc.alc-module.json`，但该文件尚未由开发者编译产出。展示模式下访问首页会加载 manifest 成功，但点击「开始学习」或「模拟编译」完成时会因 fetch 404 报错。

**解决方案：** 参照 `docs/v1.0.0/Showcase-Guide.md` 在 `/studio` 中编译 Markdown → 导出 `.alc-module.json` → 放入 `public/showcase-modules/`。

### 6.2 展示模式无 LLM 增强反馈

展示模式下学习展示题库时，答题反馈（`/api/feedback`）和费曼评估（`/api/feynman-eval`）的请求体中 `config` 为 `null`（客户端无 `alc:settings`）。这些 API 路由目前不从服务端环境变量 fallback，会返回错误。

**影响：** 本地判分（Choice / Sorting / FillBlank）正常工作，完整学习闭环不受影响。仅 LLM 增强反馈不可用。

**计划：** V1.1 补充 API 路由服务端 env fallback（M8-Plan Task 1 设计决策中标注为 Should 项）。

### 6.3 Playwright E2E 未补充

M8-Plan Task 9 Step 5 要求补充展示模式 Playwright 用例。本次未实施，原因：
- Production 模式回归由现有 `e2e/smoke.spec.ts` 覆盖
- Showcase 模式测试需要 `NEXT_PUBLIC_APP_MODE=showcase` 单独构建，Playwright 配置未支持多构建矩阵
- 展示题库 JSON 尚未生成，模拟编译完整流程测试无法通过

**计划：** 开发者生成展示题库后，手动执行 M8-Plan Task 9 Step 3-4 的验证清单。

### 6.4 `ShowcaseHome` 使用 `window.location.reload()`

`ShowcaseHome` 的错误重试使用 `window.location.reload()` 而非 Next.js `router.refresh()`，因为 App Router 的 `AppRouterInstance` 无 `reload()` 方法。这在展示模式下行为正确（刷新页面），但不是最优雅的方案。

### 6.5 `module` 变量名冲突修复

`ShowcaseHome.tsx` 原始实现使用 `const module = await ...` 触发 `@next/next/no-assign-module-variable` lint 规则。已修复为 `loadedModule`。

### 6.6 ProductionSettings 中 Provider 选择器的类型层面修改

Task 8 被要求「不触碰 settings/page.tsx」，但 `ProviderKind` 从 discriminated union 变更后，`PROVIDER_DEFAULTS` 和 `PROVIDER_LIST`（`Record<ProviderKind, ...>` 类型）必须同步更新才能通过 typecheck。Task 8 agent 做了机械的类型层面替换（`'sensenova'` → `'openai-compat'`），Task 5 agent 随后在抽取 `ProductionSettings` 时完成了完整的 UI label 更新（"SenseNova（商汤）" → "OpenAI 兼容"）。

---

## 7. 架构决策记录

### ADR-1: 构建时 inline 模式判定 vs 运行时切换

**决策：** 使用 `NEXT_PUBLIC_APP_MODE` 构建时 inline，而非运行时读取 cookie / query param。

**理由：**
- Vercel 部署是静态的，模式在构建时确定
- 构建时 inline 确保 Server / Client Component 渲染一致，无 hydration mismatch
- 无运行时开销

**代价：** 切换模式需重新构建 / 重新部署。这是预期行为 —— 展示与实用的分离是部署级别决策，不是用户偏好。

### ADR-2: 模拟编译复用 useCompileStore vs 独立状态

**决策：** MockCompileOverlay 直接向 `useCompileStore.handleEvent()` 注入合成 `CompileEvent`，复用编译中页的渲染层。

**理由：**
- `useCompileStore` 是事件驱动的，不关心事件来源
- 复用渲染层确保视觉一致性
- `useCompileStore` 非持久化，刷新即清除，不干扰真实编译

**代价：** 如果 `useCompileStore` 的 `handleEvent` 签名变更，MockCompileOverlay 需同步更新。但 store 接口稳定（M4 至今未变）。

### ADR-3: 供应商重构 — sensenova → openai-compat

**决策：** 将特化的 SenseNova 通道改为通用 OpenAI 兼容端点，不预设 baseURL。

**理由：**
- SenseNova 通道本质是 `OpenAICompatProvider` 的薄包装（仅预设 URL + model）
- 通用化后适配 OpenRouter / Together AI / Groq / 本地 Ollama / LM Studio 等
- 默认供应商改为 DeepSeek（原生端点，延迟最低）

**安全保障：** `ProviderKind` discriminated union + exhaustive switch (`const _: never = x`) 确保编译器捕获所有遗漏引用。typecheck 从 sensenova → openai-compat 后一次性暴露并修正了全部影响点。

---

## 8. V1.1 衔接建议

| 优先级 | 内容 | 说明 |
|--------|------|------|
| P0 | API 路由服务端 env fallback | `/api/feedback` / `/api/feynman-eval` 在 config=null 时 fallback 到环境变量 |
| P1 | 展示题库扩充 | 编译 3-5 个高质量题库，覆盖编程 / 科学 / 人文 |
| P1 | Playwright 展示模式 E2E | 配置多构建矩阵，补充 showcase mode 回归 |
| P2 | `/studio` 访问保护 | Vercel Password Protection 或 middleware Basic Auth |
| P2 | 模拟编译「跳过」按钮 | 如用户反馈 12s 太长 |
| P3 | 展示模式埋点 | `analytics.ts` 新增 `app_mode` 属性 |
| P3 | 运行时题库管理 | 引入轻量后端（Vercel KV / Supabase）支持运行时上传 |

---

## 9. 部署检查清单

> 开发者在 Vercel 上启用展示模式前，逐项确认：

- [ ] `NEXT_PUBLIC_APP_MODE=showcase` 已添加到 Vercel 环境变量
- [ ] `DEEPSEEK_API_KEY` 已配置（默认供应商）
- [ ] `public/showcase-modules/` 至少有 1 个 `.alc-module.json` 文件
- [ ] `manifest.json` 中 `featured: true` 条目指向存在的文件
- [ ] Redeploy 完成后访问 `/` 确认展示首页渲染
- [ ] 访问 `/studio` 确认实用首页可访问
- [ ] Network 面板无 `/api/env-config` 请求（展示模式不挂载 EnvConfigLoader）
- [ ] Network 面板无 `/api/compile` 请求（模拟编译不调 LLM）
