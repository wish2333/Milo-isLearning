# M8 Implementation Plan — Showcase Mode & Public Demo

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已上线的 ai-learning-compiler 增加展示模式（Showcase Mode），让公网访客无需 API Key 即可体验完整学习闭环。通过环境变量 `NEXT_PUBLIC_APP_MODE` 实现 Vercel（展示页）与本地开发（实用页）的双首页架构；预编译题库作为静态资源随构建分发；模拟编译复用 `useCompileStore` 喂合成事件，零 LLM 调用。同时重构供应商层：将特化的 SenseNova 通道改为通用 OpenAI 兼容端点，默认供应商改为 DeepSeek。

**Architecture:** M8 保持 local-first、零后端。新增 `NEXT_PUBLIC_APP_MODE` 构建时环境变量控制 `/` 与 `/settings` 的条件渲染。展示题库以 `CompiledModulePackage` JSON 格式存放在 `public/showcase-modules/`，客户端 `fetch` 加载后通过现有 `importModulePackage()` 写入 LocalStorage。模拟编译不创建 compile-job、不调 `/api/compile`，直接向 `useCompileStore.handleEvent()` 注入合成的 `CompileEvent` 序列。展示模式不挂载 `EnvConfigLoader`、不写 `alc:settings`、不暴露 API Key 输入。实用页通过 `/studio` 路由在所有环境保留访问。

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Zustand, `process.env.NEXT_PUBLIC_*`（构建时 inline），无新增依赖。

**依据：** `docs/v1.0.0/Deploying.md`（Vercel 部署架构）、`docs/v1.0.0/M7.8-Plan.md`（Task 5 首页智能路由、Task 4 全局导航）、`docs/v0.1.0/Technical-Specification.md` §3 Providers / §6.1 Storage。M8 不新增 PRD FR 编号（非产品功能需求，属部署/展示工程）。

## Global Constraints

- **不引入后端 / 数据库 / 对象存储。** 展示题库是仓库内的静态文件，随 Vercel 构建分发。新增 / 修改展示题库 = 改代码 + 重新部署。
- **不改变现有学习流程代码。** `/learn/*` 路由在两种模式下共享同一套组件，仅导航入口不同。学习页、答题、判分、费曼均不修改。
- **展示模式不触碰 `alc:settings`。** 不挂载 `EnvConfigLoader`、不调 `/api/env-config`、不渲染 API Key 输入框。展示模式的 Settings 是纯信息页。
- **展示模式不调用 LLM。** 模拟编译喂合成事件；展示题库通过 `importModulePackage()` 加载到 LocalStorage，学习时的本地判分（Choice/Sorting/FillBlank）不需要 LLM。如需 LLM 增强反馈（`/api/feedback` / `/api/feynman-eval`），走服务端环境变量 fallback（见 Task 1 设计决策）。
- **实用页在所有环境保留访问。** Vercel（showcase mode）上 `/studio` 始终渲染实用首页，`/studio/settings` 始终渲染实用 Settings。这确保远程调试和真实编译验证不受影响。
- **环境变量在构建时 inline。** `NEXT_PUBLIC_APP_MODE` 是 `NEXT_PUBLIC_` 前缀，Next.js 构建时将其替换为字面量。模式判定是静态的，不存在运行时切换。
- **不破坏 M7.8 的成果。** 首页智能路由、全局导航、蒙对标注、间隔重复等在实用模式下行为不变。展示模式下仅隐藏不适用的入口（如"导入新内容"）。
- **展示题库 JSON 必须通过 `parseModulePackage()` 校验。** 复用现有的 6 步验证（含"拒绝 apiKey"），确保展示题库不含敏感信息。
- **所有展示题库 JSON 由实用模式编译产出。** 先在 `/studio` 中正常编译 → 导出 `.alc-module.json` → 放入 `public/showcase-modules/`。不手写 JSON。

---

## 0. 背景与动机

### 0.1 问题

M7.8 完成后，产品已部署到 Vercel（`docs/v1.0.0/Deploying.md`）。但当前架构存在一个公开展示的障碍：

**所有公网访客共用部署者的 LLM API Key。**

当前 `/api/env-config` 将服务端环境变量中的 API Key 代理给前端，`EnvConfigLoader` 全局挂载并写入 `alc:settings`。任何访客打开网站后触发编译，都会消耗部署者的 LLM 额度。一旦网址被转发，账单不可控。

### 0.2 解决思路

将"展示"与"实用"分离：

| 维度 | 展示模式（Vercel 默认） | 实用模式（本地 dev / `/studio`） |
|------|------------------------|--------------------------------|
| 首页 | 展示页：题库列表 + 模拟编译按钮 | 实用页：智能路由（现有逻辑） |
| 编译 | 模拟编译（合成事件动画，不调 LLM） | 真实编译（SSE → `/api/compile`） |
| Settings | 纯信息页（无 API Key 输入） | 完整设置（API Key / Provider / Model） |
| EnvConfigLoader | 不挂载 | 挂载（现有行为） |
| API Key 存储 | 不存储任何 API 信息 | `alc:settings`（现有行为） |

展示模式下，访客的体验完整闭环：浏览题库 → 模拟编译动画 → 进入预编译题库学习 → 答题/判分/费曼。全程不消耗 LLM 额度。

### 0.3 设计取舍

- **M8 不做运行时上传 / 管理后台。** 展示题库由开发者在仓库中维护，随构建分发。如需动态管理，推迟到引入后端的版本。
- **M8 不做展示模式独占的 `/learn/*` 路由。** 学习流程页共享，仅导航入口不同。降低维护成本。
- **M8 不做模拟编译的"跳过"按钮。** 动画总时长约 12-16 秒（8 阶段 × 1.5-2s），用户可等待。如反馈差再加速或加跳过。
- **M8 不改 API 路由签名。** `/api/compile` / `/api/feedback` / `/api/feynman-eval` 保持不变。展示模式根本不调 `/api/compile`；`/api/feedback` 等在展示模式下可能被学习页调用，服务端 fallback 到环境变量。
- **供应商重构不改 API 路由签名。** 只改 `ProviderKind` 枚举值和 provider factory dispatch；`LLMConfig` / `ChatRequest` / `ChatResponse` 接口不变；`OpenAICompatProvider` 基础类不变。exhaustive switch 编译期保障全覆盖。

---

## 1. 现状分析与根因映射

| 问题 | 当前根因 | M8 解决路径 |
|------|---------|------------|
| 公网访客消耗部署者 API Key | `EnvConfigLoader` 全局挂载，`/api/env-config` 代理 Key 到前端 | Task 6 条件化 `EnvConfigLoader`，展示模式不挂载 |
| 无展示用首页 | `page.tsx` 是唯一的实用首页（智能路由），无展示变体 | Task 3 新增 `ShowcaseHome`，`page.tsx` 条件渲染 |
| 无预编译题库分发机制 | Module 只存 LocalStorage，无共享分发渠道 | Task 2 新增 `public/showcase-modules/` 静态资源 + 加载器 |
| 无模拟编译 | 编译必须调 `/api/compile`（SSE + LLM），无离线模拟 | Task 4 新增 `MockCompileOverlay`，喂合成事件到 `useCompileStore` |
| Settings 暴露 API Key 输入 | `settings/page.tsx` 始终渲染完整表单 | Task 5 条件渲染 `ShowcaseSettings`（纯信息页） |
| Vercel 上无法访问实用页 | `/` 被展示页占据，实用页无独立路由 | Task 6 新增 `/studio` 路由组 |
| Sensenova 特化绑定不利于通用 OpenAI 兼容端点 | `ProviderKind` 第三个是 `sensenova`，硬编码 `https://token.sensenova.cn/v1` | Task 8 改为 `openai-compat`（无预设 URL），默认供应商改为 `deepseek` |

---

## 2. Milestone Scope

### 2.1 Must（M8）

1. **环境变量基础设施**：`NEXT_PUBLIC_APP_MODE` + `app-mode.ts` 模式判定工具。
2. **展示题库静态资源**：`public/showcase-modules/` 目录 + `manifest.json` 清单 + 至少 1 个预编译题库。
3. **展示题库加载器**：`showcase-loader.ts`，fetch manifest → fetch package → `parseModulePackage` → `importModulePackage` → 写入 LocalStorage。
4. **展示首页**：`ShowcaseHome` 组件，展示题库卡片列表 + "模拟编译"按钮。
5. **模拟编译**：`MockCompileOverlay` 组件，8 阶段合成事件动画，完成后加载 featured 题库并跳转学习页。
6. **展示 Settings 信息页**：`ShowcaseSettings` 组件，说明展示模式 + 列出可用题库 + 链接到 `/studio`。
7. **根布局条件化**：`layout.tsx` 根据模式条件渲染 `EnvConfigLoader`。
8. **`/studio` 实用页路由**：始终渲染实用首页 + 实用 Settings，不受 `APP_MODE` 影响。
9. **导航适配**：`GlobalNav` 在展示模式隐藏"导入新内容"入口。
10. **供应商重构**：`ProviderKind` 第三个从 `sensenova` 改为 `openai-compat`（通用 OpenAI 兼容端点，不预设 base URL）；默认供应商从 `sensenova` 改为 `deepseek`；环境变量 `SENSENOVA_*` 改为 `OPENAI_COMPAT_*`。
11. Typecheck、lint、unit tests、Playwright smoke 全部通过。

### 2.2 Should（M8 Stretch）

1. 展示首页"模拟编译"跳过按钮（如动画时长反馈差）。
2. 多个展示题库（M8 Must 只要求 1 个，Should 扩展到 3-5 个覆盖不同学科）。
3. 展示题库卡片的概念数 / 题数 / 预计时长展示（需 manifest 扩展元数据）。

### 2.3 Not Now（推迟到 V1.1+）

- 运行时上传展示题库（需后端 + 管理后台 + 鉴权）。
- 展示模式独立的学习页主题 / branding。
- 展示模式埋点（复用 M7.8 的 `analytics.ts`，但可能需要区分 `app_mode` 属性）。
- 展示题库的版本管理与热更新（当前必须重新部署才能更新）。

---

## 3. File Structure

### 3.1 Create

- `src/lib/runtime/app-mode.ts`
  模式判定常量：`APP_MODE` + `isShowcaseMode` + `isProductionMode`。构建时 inline。

- `src/lib/showcase/showcase-loader.ts`
  展示题库加载器：`fetchShowcaseManifest()` / `fetchShowcaseModule()` / `loadShowcaseModuleIntoStorage()`。

- `src/lib/showcase/__tests__/showcase-loader.test.ts`
  manifest 解析、package fetch、parseModulePackage 集成、importModulePackage 集成。

- `src/lib/showcase/mock-compile-events.ts`
  合成 `CompileEvent[]` 序列生成器：8 阶段 `stage_enter` + `progress` 事件，每阶段固定时长。

- `src/components/home/ShowcaseHome.tsx`
  展示首页：题库卡片列表 + "模拟编译"按钮 + `MockCompileOverlay` 状态管理。

- `src/components/home/ProductionHome.tsx`
  实用首页：从现有 `page.tsx` 抽取的智能路由首页逻辑。

- `src/components/showcase/MockCompileOverlay.tsx`
  模拟编译全屏动画：复用 `useCompileStore` 渲染 8 阶段进度。

- `src/components/showcase/ShowcaseModuleCard.tsx`
  展示题库卡片：标题 / 概念数 / 题数 / "开始学习"按钮。

- `src/components/settings/ShowcaseSettings.tsx`
  展示 Settings 纯信息页。

- `src/components/settings/ProductionSettings.tsx`
  实用 Settings：从现有 `settings/page.tsx` 抽取的完整设置逻辑。

- `src/app/studio/page.tsx`
  `/studio` 实用首页（始终渲染 `ProductionHome`，不受模式影响）。

- `src/app/studio/settings/page.tsx`
  `/studio/settings` 实用 Settings（始终渲染 `ProductionSettings`）。

- `public/showcase-modules/manifest.json`
  展示题库清单。

- `public/showcase-modules/*.alc-module.json`
  预编译展示题库（至少 1 个，通过实用模式编译 → 导出生成）。

### 3.2 Modify

- `src/app/page.tsx`
  改为 Server Component 条件渲染：`isShowcaseMode ? <ShowcaseHome /> : <ProductionHome />`。

- `src/app/settings/page.tsx`
  改为 Server Component 条件渲染：`isShowcaseMode ? <ShowcaseSettings /> : <ProductionSettings />`。

- `src/app/layout.tsx`
  根据模式条件渲染 `<EnvConfigLoader />`：`!isShowcaseMode && <EnvConfigLoader />`。

- `src/components/learn/GlobalNav.tsx`
  展示模式隐藏"导入新内容"入口（`import { isShowcaseMode }`）。

- `src/components/EnvConfigLoader.tsx`
  新增 `enabled` prop（默认 `true`），`enabled === false` 时 `useEffect` 提前 return。双重保险。

- `src/lib/providers/types.ts`
  `ProviderKind` 从 `'deepseek' | 'glm' | 'sensenova'` 改为 `'deepseek' | 'glm' | 'openai-compat'`。

- `src/lib/providers/index.ts`
  Factory dispatch case `'sensenova'` → `'openai-compat'`；`isSupportedProvider` 更新；exports 更新。

- `src/lib/providers/sensenova.ts` → 重命名为 `openai-compat-provider.ts`
  `createSenseNovaProvider` → `createOpenAICompatProvider`；`sensenovaDefaults` → `openaiCompatDefaults`（移除预设 baseURL 和 model）。

- `src/app/api/env-config/route.ts`
  `PROVIDER_DEFAULT_BASE_URL['openai-compat']` = 空字符串（用户必填）；`readAllApiKeys` 读 `OPENAI_COMPAT_API_KEY`；默认 provider 改为 `deepseek`，默认 model 改为 `deepseek-chat`。

- `src/app/settings/page.tsx`（M8 Task 5 拆分为 `ProductionSettings` 时一并修改）
  Provider 选择器：`sensenova` 选项改为 `openai-compat`（label "OpenAI 兼容"）；`PROVIDER_DEFAULTS` 更新。

- `scripts/ping.ts` / `scripts/prompt-eval.ts` / `scripts/m3-smoke.ts`
  CLI 脚本中 provider 枚举引用从 `sensenova` 改为 `openai-compat`；环境变量引用更新。

- `docs/v1.0.0/Deploying.md`
  环境变量表：`SENSENOVA_*` 改为 `OPENAI_COMPAT_*`；默认 provider 改为 `deepseek`。

- `e2e/smoke.spec.ts`
  补充展示模式首页渲染、模拟编译、`/studio` 实用页可访问性回归。

---

## 4. Task Plan

### Task 1: 环境变量基础设施与模式判定

**工作量：** 小。**依赖：** 无（所有后续 Task 的基础）。

**Files:**
- Create: `src/lib/runtime/app-mode.ts`
- Modify: `src/components/EnvConfigLoader.tsx`（新增 `enabled` prop）

**设计决策 — 展示模式下的 LLM API 路由 fallback：**

展示模式下用户学习展示题库时，答题反馈（`/api/feedback`）和费曼评估（`/api/feynman-eval`）可能被调用。当前这些路由从请求体读 `config`（客户端传入）。展示模式客户端无 `alc:settings`，请求体中 `config` 为 `null`。

方案：不改 API 路由签名。`/api/feedback` 等路由在 `config === null` 时 fallback 到服务端环境变量（与 `/api/env-config` 相同的读取逻辑）。这样展示模式也能获得 LLM 反馈，且 API Key 不暴露在客户端。

> **注意：** 此 fallback 是否纳入 M8 Must 取决于展示题库是否需要 LLM 反馈。如果展示题库的本地判分已足够演示，可推迟 fallback 到 Should。先标注，Task 1 只做模式判定基础设施。

- [ ] **Step 1: 创建 app-mode.ts**

Create `src/lib/runtime/app-mode.ts`:

```ts
/**
 * App Mode — 构建时环境变量控制展示模式与实用模式
 *
 * NEXT_PUBLIC_APP_MODE=showcase  → Vercel 默认，展示页
 * NEXT_PUBLIC_APP_MODE=production（或未设）→ 本地 dev 默认，实用页
 *
 * 因为 NEXT_PUBLIC_ 前缀，此常量在构建时被 Next.js inline 为字面量，
 * client component 和 server component 均可直接 import。
 */

export type AppMode = 'showcase' | 'production'

export const APP_MODE: AppMode =
  process.env.NEXT_PUBLIC_APP_MODE === 'showcase' ? 'showcase' : 'production'

export const isShowcaseMode = APP_MODE === 'showcase'
export const isProductionMode = APP_MODE === 'production'
```

- [ ] **Step 2: EnvConfigLoader 新增 enabled prop**

In `src/components/EnvConfigLoader.tsx`:

```tsx
interface EnvConfigLoaderProps {
  enabled?: boolean // 默认 true；展示模式传 false 跳过
}

export function EnvConfigLoader({ enabled = true }: EnvConfigLoaderProps) {
  useEffect(() => {
    if (!enabled) return
    // ...existing fetch logic...
  }, [enabled])

  return null
}
```

双重保险：即使 layout.tsx 忘了条件渲染，`enabled={false}` 也能阻止 fetch。

- [ ] **Step 3: 文档记录环境变量**

在 `docs/v1.0.0/Deploying.md` 的"环境变量配置"章节新增：

```bash
# 展示模式（Vercel 默认）
NEXT_PUBLIC_APP_MODE=showcase

# 实用模式（本地 dev 默认，不设即为 production）
# NEXT_PUBLIC_APP_MODE=production
```

- [ ] **Step 4: 测试**

```ts
// app-mode.test.ts — 仅测试未设环境变量时默认为 production
it('defaults to production mode when env var is not set', () => {
  // process.env.NEXT_PUBLIC_APP_MODE 在测试环境为 undefined
  expect(isProductionMode).toBe(true)
  expect(isShowcaseMode).toBe(false)
})
```

> **注意：** `APP_MODE` 在构建时 inline，测试中只能验证默认值（production）。`showcase` 分支需通过 E2E 验证（设置环境变量后构建）。

Run: `bun run test src/lib/runtime/__tests__/app-mode.test.ts`

---

### Task 2: 展示题库静态资源与加载器

**工作量：** 中。**依赖：** 无（可与 Task 1 并行）。

**Files:**
- Create: `public/showcase-modules/manifest.json`
- Create: `public/showcase-modules/*.alc-module.json`（至少 1 个）
- Create: `src/lib/showcase/showcase-loader.ts`
- Create: `src/lib/showcase/__tests__/showcase-loader.test.ts`

**展示题库产出流程：**

```
1. 在实用模式（/studio）中粘贴 Markdown → 真实编译 → 导出 .alc-module.json
2. 将导出文件放入 public/showcase-modules/
3. 在 manifest.json 中登记
4. 重新部署
```

- [ ] **Step 1: manifest.json 格式定义**

Create `public/showcase-modules/manifest.json`:

```json
{
  "version": 1,
  "modules": [
    {
      "id": "intro-to-alc",
      "package": "intro-to-alc.alc-module.json",
      "title": "什么是 AI 学习编译器",
      "description": "用 3 个概念理解 AI Learning Compiler 的核心闭环",
      "featured": true,
      "order": 1
    }
  ]
}
```

字段说明：
- `id`：展示题库的逻辑标识（独立于 Module 自身的 `moduleId`，用于 manifest 索引）
- `package`：`public/showcase-modules/` 下的文件名
- `featured: true`：模拟编译默认进入此题库（有且仅有一个 `featured: true`）
- `order`：展示首页卡片排序

- [ ] **Step 2: 生成首个展示题库**

在 `/studio` 中编译一段优质 Markdown（推荐用"费曼学习法"、"React Hooks 入门"等通用话题），导出 `.alc-module.json`，放入 `public/showcase-modules/`，登记到 manifest。

> **注意：** 导出前确认 Module 内容质量（概念清晰、题目无错漏、费曼步骤完整）。展示题库代表产品门面。

- [ ] **Step 3: showcase-loader.ts**

Create `src/lib/showcase/showcase-loader.ts`:

```ts
import { parseModulePackage, importModulePackage } from '@/lib/persistence/module-package'
import { storage } from '@/lib/persistence/local-storage'
import type { Module } from '@/types/domain'

/** Manifest 条目 */
export interface ShowcaseManifestEntry {
  id: string
  package: string
  title: string
  description: string
  featured: boolean
  order: number
}

/** Manifest 结构 */
export interface ShowcaseManifest {
  version: number
  modules: ShowcaseManifestEntry[]
}

/** Featured 题库（模拟编译默认目标） */
export type FeaturedModule = ShowcaseManifestEntry | null

const MANIFEST_PATH = '/showcase-modules/manifest.json'
const MODULE_BASE = '/showcase-modules'

/**
 * Fetch manifest.json。
 * 服务端无缓存（public/ 静态文件由 CDN/浏览器缓存）。
 */
export async function fetchShowcaseManifest(): Promise<ShowcaseManifest> {
  const res = await fetch(MANIFEST_PATH)
  if (!res.ok) throw new Error(`Failed to fetch showcase manifest: ${res.status}`)
  return res.json()
}

/**
 * Fetch 单个展示题库 JSON（未解析的 CompiledModulePackage）。
 */
async function fetchShowcasePackage(fileName: string): Promise<unknown> {
  const res = await fetch(`${MODULE_BASE}/${fileName}`)
  if (!res.ok) throw new Error(`Failed to fetch showcase module ${fileName}: ${res.status}`)
  return res.json()
}

/**
 * 加载展示题库到 LocalStorage。
 *
 * 流程：fetch package JSON → parseModulePackage（6 步校验）
 *      → importModulePackage（分配新 ID + 写入 storage）→ 返回 Module
 *
 * 每次调用都分配新 ID，因此同一展示题库可反复加载（每次产生新的本地副本）。
 * 这允许用户多次"模拟编译"同一题库而不冲突。
 */
export async function loadShowcaseModuleIntoStorage(
  entry: ShowcaseManifestEntry,
): Promise<Module> {
  const rawPackage = await fetchShowcasePackage(entry.package)
  const parsed = parseModulePackage(rawPackage)
  return importModulePackage(storage, parsed)
}

/**
 * 从 manifest 中找到 featured 题库。
 */
export function findFeaturedModule(manifest: ShowcaseManifest): FeaturedModule {
  return manifest.modules.find((m) => m.featured) ?? manifest.modules[0] ?? null
}

/**
 * 按 order 排序返回所有题库条目。
 */
export function listShowcaseModules(manifest: ShowcaseManifest): ShowcaseManifestEntry[] {
  return [...manifest.modules].sort((a, b) => a.order - b.order)
}
```

- [ ] **Step 4: 测试**

```ts
// showcase-loader.test.ts
// fetch mock → manifest 解析
it('parses manifest with correct version and modules', async () => { ... })
it('findFeaturedModule returns the featured entry', () => { ... })
it('findFeaturedModule falls back to first module if none featured', () => { ... })
it('listShowcaseModules sorts by order field', () => { ... })
// fetch mock → package 加载
it('loadShowcaseModuleIntoStorage parses and imports package', async () => { ... })
it('loadShowcaseModuleIntoStorage throws on invalid package (contains apiKey)', async () => { ... })
```

> **注意：** `fetch` 在 Vitest 的 node 环境下需要 mock（`vi.fn()`）。使用 `vi.stubGlobal('fetch', mockedFetch)`。

Run: `bun run test src/lib/showcase/__tests__/showcase-loader.test.ts`

---

### Task 3: 展示首页

**工作量：** 中。**依赖：** Task 1（`isShowcaseMode`）、Task 2（`showcase-loader`）。

**Files:**
- Create: `src/components/home/ProductionHome.tsx`
- Create: `src/components/home/ShowcaseHome.tsx`
- Create: `src/components/showcase/ShowcaseModuleCard.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 抽取 ProductionHome**

将当前 `src/app/page.tsx` 的全部逻辑（`'use client'` + 智能路由 + CTA 按钮）原样移动到 `src/components/home/ProductionHome.tsx`。

```tsx
// src/components/home/ProductionHome.tsx
'use client'
// ...从 page.tsx 原样搬迁的全部代码...
export function ProductionHome() { /* 现有 HomePage 逻辑 */ }
```

- [ ] **Step 2: ShowcaseModuleCard 组件**

Create `src/components/showcase/ShowcaseModuleCard.tsx`:

```tsx
import type { ShowcaseManifestEntry } from '@/lib/showcase/showcase-loader'

interface Props {
  entry: ShowcaseManifestEntry
  onStart: (entry: ShowcaseManifestEntry) => void
}
```

- 卡片样式复用 `.alc-card`
- 展示：标题、描述、featured 徽章（如有）
- "开始学习"按钮 → 调用 `onStart`

- [ ] **Step 3: ShowcaseHome 组件**

Create `src/components/home/ShowcaseHome.tsx`:

```tsx
'use client'

interface ShowcaseHomeState {
  status: 'idle' | 'loading-manifest' | 'ready' | 'mock-compiling' | 'error'
  manifest: ShowcaseManifest | null
}
```

**组件行为：**

1. `useEffect` 挂载时 `fetchShowcaseManifest()` → 渲染题库卡片列表
2. 点击任意卡片"开始学习" → `loadShowcaseModuleIntoStorage(entry)` → `router.push('/learn/module/${module.id}')`
3. 点击"模拟编译" → 切换到 `mock-compiling` 状态 → 渲染 `<MockCompileOverlay>`
4. 模拟编译完成回调 → 加载 featured 题库 → `router.push`

**展示首页结构（视觉）：**

```
┌─────────────────────────────────┐
│     AI Learning Compiler        │
│   (展示模式 tagline)             │
│                                 │
│      [ 模拟编译 ]                │
│                                 │
│  ── 精选题库 ──                  │
│  ┌─────────┐ ┌─────────┐       │
│  │ 题库 A   │ │ 题库 B   │       │
│  │ 3 概念   │ │ 5 概念   │       │
│  │ [开始]   │ │ [开始]   │       │
│  └─────────┘ └─────────┘       │
│                                 │
│  想编译自己的内容？访问 /studio  │
└─────────────────────────────────┘
```

- 底部低调链接到 `/studio`（"想编译自己的内容？"）
- 导航栏链接到 `/settings`（展示 Settings 信息页）

- [ ] **Step 4: page.tsx 条件渲染**

Modify `src/app/page.tsx` — 改为 Server Component:

```tsx
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { ProductionHome } from '@/components/home/ProductionHome'
import { ShowcaseHome } from '@/components/home/ShowcaseHome'

export default function HomePage() {
  return isShowcaseMode ? <ShowcaseHome /> : <ProductionHome />
}
```

> **注意：** `page.tsx` 从 `'use client'` 改为 Server Component（无 `'use client'`）。`ProductionHome` 和 `ShowcaseHome` 各自是 Client Component。Server Component 条件渲染 Client Component 是合法的 Next.js 模式。

- [ ] **Step 5: 测试**

- Playwright：production 模式下 `/` 显示智能路由首页；showcase 模式下 `/` 显示题库列表。
- 题库卡片点击 → 导航到 `/learn/module/[id]`。

Run: `bun run e2e`

---

### Task 4: 模拟编译流程

**工作量：** 中。**依赖：** Task 1（`useCompileStore` 现有）、Task 2（`loadShowcaseModuleIntoStorage`）、Task 3（`ShowcaseHome` 状态管理）。

**Files:**
- Create: `src/lib/showcase/mock-compile-events.ts`
- Create: `src/components/showcase/MockCompileOverlay.tsx`

**核心洞察：** `useCompileStore.handleEvent(event: CompileEvent)` 是事件驱动的，不关心事件来源（SSE 或合成）。模拟编译只需按时序构造 `CompileEvent` 对象喂给 store，渲染层自动复用真实编译的进度 UI。

- [ ] **Step 1: mock-compile-events.ts**

Create `src/lib/showcase/mock-compile-events.ts`:

```ts
import type { CompileEvent } from '@/lib/compiler/pipeline/types'

/**
 * 8 个编译阶段的中文标签（与 compiling/page.tsx STAGE_LABELS 一致）。
 */
const STAGE_LABELS: Record<string, string> = {
  import: '正在清理文本',
  chunk: '正在切分知识块',
  concept: '正在提取核心概念',
  module: '正在构建学习模块',
  mission: '正在规划练习序列',
  quiz: '正在生成练习题',
  challenge: '正在生成综合挑战题',
  feynman: '正在设计费曼任务',
}

/**
 * 每阶段的展示时长（毫秒）。
 * 总时长约 12s（8 × 1.5s），可调整。
 */
const STAGE_DURATION_MS = 1500

/**
 * 生成 8 阶段的合成 CompileEvent 序列（不含 complete 事件）。
 *
 * 每个 stage 产生：
 *   1. { kind: 'stage_enter', stage }
 *   2. { kind: 'progress', stage, percent, message }
 *
 * complete 事件由调用方在加载完 Module 后自行构造（因为需要 Module 数据）。
 */
export interface TimedEvent {
  event: CompileEvent
  delay: number // 距上一个事件的延迟（ms）
}

export function generateMockCompileEvents(): TimedEvent[] {
  const events: TimedEvent[] = []
  const stages = ['import', 'chunk', 'concept', 'module', 'mission', 'quiz', 'challenge', 'feynman']
  // 百分比与 STAGE_PERCENT 对齐（见 pipeline/types.ts）
  const percents: Record<string, number> = {
    import: 25, chunk: 40, concept: 55, module: 65,
    mission: 70, quiz: 88, challenge: 96, feynman: 100,
  }

  for (const stage of stages) {
    events.push({
      event: { kind: 'stage_enter', stage } as CompileEvent,
      delay: 0,
    })
    events.push({
      event: {
        kind: 'progress',
        stage,
        percent: percents[stage],
        message: STAGE_LABELS[stage],
      } as CompileEvent,
      delay: STAGE_DURATION_MS / 2,
    })
  }
  return events
}
```

- [ ] **Step 2: MockCompileOverlay 组件**

Create `src/components/showcase/MockCompileOverlay.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useCompileStore } from '@/lib/state/compile-store'
import { generateMockCompileEvents } from '@/lib/showcase/mock-compile-events'

interface Props {
  onComplete: () => void // 加载题库 + 跳转的回调（由 ShowcaseHome 提供）
  onError: (message: string) => void
}
```

**组件行为：**

1. 挂载时 `generateMockCompileEvents()` 获取事件序列
2. 用 `setTimeout` 链按 `delay` 依次调用 `useCompileStore.handleEvent(event)`
3. 全部事件播放完毕后（约 12s），调用 `onComplete()`
4. 渲染层直接复用 `useCompileStore` 的 `stage` / `percent` / `message` — 与真实编译页完全一致的 UI
5. 组件卸载时清理所有 pending `setTimeout`（`useRef` 持有 timer ID 列表）

> **注意：** MockCompileOverlay 不创建 compile-job、不写 sessionStorage、不调 `/api/compile`。它只是 `useCompileStore` 的事件播放器。`useCompileStore` 是非持久化的（M7.5），所以模拟编译状态刷新即清除，不会干扰真实编译。

- [ ] **Step 3: ShowcaseHome 接入 MockCompileOverlay**

In `ShowcaseHome.tsx`:

```tsx
const handleMockCompile = async () => {
  setStatus('mock-compiling')
  // MockCompileOverlay 播放动画
  // onComplete 回调：
  //   const featured = findFeaturedModule(manifest!)
  //   const module = await loadShowcaseModuleIntoStorage(featured)
  //   setModule(module)  // useModuleStore
  //   startModule(module.id)  // useProgressStore
  //   router.push(`/learn/module/${module.id}`)
}
```

`onComplete` 回调中：
1. 从 manifest 取 featured 题库
2. `loadShowcaseModuleIntoStorage()` 加载到 LocalStorage（分配新 ID）
3. `useModuleStore.setModule()` 设置当前 Module
4. `useProgressStore.startModule()` 初始化状态机为 `module_intro`
5. `router.push('/learn/module/${id}')` 进入学习

- [ ] **Step 4: 测试**

```ts
// mock-compile-events.test.ts
it('generates 16 events for 8 stages (stage_enter + progress each)', () => { ... })
it('first event has delay 0', () => { ... })
it('feynman stage reaches 100%', () => { ... })
```

Playwright（showcase mode）：
- 展示首页"模拟编译" → 8 阶段动画依次显示 → 约 12s 后跳转到 `/learn/module/[id]`
- 跳转后页面渲染 Module intro

Run: `bun run test src/lib/showcase/__tests__/mock-compile-events.test.ts && bun run e2e`

---

### Task 5: 展示 Settings 信息页

**工作量：** 小。**依赖：** Task 1（`isShowcaseMode`）、Task 2（`listShowcaseModules`）。

**Files:**
- Create: `src/components/settings/ProductionSettings.tsx`
- Create: `src/components/settings/ShowcaseSettings.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: 抽取 ProductionSettings**

将当前 `src/app/settings/page.tsx` 的全部逻辑（provider 选择器、API Key 输入、ping 测试、保存/清除）原样移动到 `src/components/settings/ProductionSettings.tsx`。

- [ ] **Step 2: ShowcaseSettings 组件**

Create `src/components/settings/ShowcaseSettings.tsx`:

```tsx
'use client'
```

**页面内容（纯信息，无表单）：**

```
┌─────────────────────────────────┐
│         设置                     │
│                                 │
│  📋 展示模式                     │
│  当前为展示模式，无需配置 API。   │
│  所有题库均为预编译内容。         │
│                                 │
│  ── 可用题库 ──                  │
│  • 什么是 AI 学习编译器 (featured)│
│  • React Hooks 入门              │
│  • ...                           │
│                                 │
│  ── 完整功能 ──                  │
│  需要编译自己的内容？             │
│  [ 访问完整版 /studio ]          │
│                                 │
│  ── 关于 ──                      │
│  AI Learning Compiler v1.0.0     │
│  Local-first · Zero-backend     │
└─────────────────────────────────┘
```

- 读取 `fetchShowcaseManifest()` 列出可用题库（标题 + featured 标记）
- "访问完整版"链接到 `/studio`
- 不调 `/api/env-config`、不读 `useSettingsStore`、不渲染任何输入框
- 复用 `.alc-card` / `.alc-label` / `.alc-muted` token

- [ ] **Step 3: settings/page.tsx 条件渲染**

Modify `src/app/settings/page.tsx`:

```tsx
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { ProductionSettings } from '@/components/settings/ProductionSettings'
import { ShowcaseSettings } from '@/components/settings/ShowcaseSettings'

export default function SettingsPage() {
  return isShowcaseMode ? <ShowcaseSettings /> : <ProductionSettings />
}
```

- [ ] **Step 4: 测试**

Playwright（showcase mode）：`/settings` 显示信息页，无 API Key 输入框，有"访问完整版"链接到 `/studio`。

Run: `bun run e2e`

---

### Task 6: 根布局条件化 + /studio 实用页路由

**工作量：** 小。**依赖：** Task 1（`isShowcaseMode`）、Task 3（`ProductionHome`）、Task 5（`ProductionSettings`）。

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/studio/page.tsx`
- Create: `src/app/studio/settings/page.tsx`

- [ ] **Step 1: 根布局条件化 EnvConfigLoader**

In `src/app/layout.tsx`:

```tsx
import { isShowcaseMode } from '@/lib/runtime/app-mode'

// <body> 内：
{!isShowcaseMode && <EnvConfigLoader />}
```

> **注意：** 根 layout 是 Server Component，`isShowcaseMode` 在构建时 inline。Vercel 构建时 `NEXT_PUBLIC_APP_MODE=showcase` → `EnvConfigLoader` 不渲染 → 展示模式不 fetch `/api/env-config`。本地构建时未设 → `EnvConfigLoader` 正常渲染。

- [ ] **Step 2: /studio 实用首页**

Create `src/app/studio/page.tsx`:

```tsx
import { ProductionHome } from '@/components/home/ProductionHome'
export default function StudioPage() {
  return <ProductionHome />
}
```

`/studio` 在所有环境下始终渲染实用首页，不受 `APP_MODE` 影响。

> **注意：** `/studio` 在展示模式下也渲染实用首页。实用首页的"开始学习"智能路由在展示模式下会检测到 LocalStorage 无 Module → 跳转 `/learn/import`。但展示模式下 `EnvConfigLoader` 未挂载 → `alc:settings` 为空 → import 页会跳 `/settings`（无 config）→ 展示 Settings 信息页。这条路径不调 LLM，但用户无法真实编译。这是预期行为：`/studio` 提供的是"实用首页视图"，不是"绕过展示模式编译"。如需真实编译，在 `/studio/settings` 手动输入 API Key。

- [ ] **Step 3: /studio/settings 实用 Settings**

Create `src/app/studio/settings/page.tsx`:

```tsx
import { ProductionSettings } from '@/components/settings/ProductionSettings'
export default function StudioSettingsPage() {
  return <ProductionSettings />
}
```

`/studio/settings` 在所有环境下始终渲染完整 Settings 表单（含 API Key 输入），允许部署者在 Vercel 上远程配置 API Key 后进行真实编译验证。

- [ ] **Step 4: 测试**

Playwright：
- 展示模式下 `/studio` 渲染实用首页（"开始学习"按钮可见）
- 展示模式下 `/studio/settings` 渲染完整 Settings（API Key 输入框可见）
- production 模式下 `/studio` 与 `/` 渲染一致

Run: `bun run e2e`

---

### Task 7: 导航适配

**工作量：** 小。**依赖：** Task 1（`isShowcaseMode`）。

**Files:**
- Modify: `src/components/learn/GlobalNav.tsx`

- [ ] **Step 1: GlobalNav 展示模式适配**

In `src/components/learn/GlobalNav.tsx`:

```tsx
import { isShowcaseMode } from '@/lib/runtime/app-mode'

// 导航项列表：
const navItems = [
  { href: '/', label: '首页' },
  { href: '/learn/library', label: '我的题库' },
  ...(isShowcaseMode
    ? [] // 展示模式隐藏"导入新内容"
    : [{ href: '/learn/import', label: '导入新内容' }]),
  { href: '/settings', label: '设置' },
]
```

展示模式下：
- "导入新内容"入口隐藏（展示模式不支持真实编译）
- "我的题库"保留（用户加载的展示题库存在 LocalStorage，可在题库页查看）
- "设置"链接到展示 Settings 信息页

- [ ] **Step 2: 展示首页导航链接**

`ShowcaseHome` 的导航（如有）链接到：
- `/settings`（展示 Settings）
- `/studio`（"想编译自己的内容？"链接）

不链接到 `/learn/import`（展示模式无此入口）。

- [ ] **Step 3: 测试**

Playwright（showcase mode）：
- 全局导航不显示"导入新内容"
- `/learn/library` 正常显示已加载的展示题库

Run: `bun run e2e`

---

### Task 8: 供应商重构 — SenseNova → OpenAI 兼容 + 默认 DeepSeek

**工作量：** 中。**依赖：** 无（与展示模式正交，但应与 Task 5 Settings 拆分协调）。

**Files:**
- Modify: `src/lib/providers/types.ts`
- Rename: `src/lib/providers/sensenova.ts` → `src/lib/providers/openai-compat-provider.ts`
- Modify: `src/lib/providers/index.ts`
- Modify: `src/app/api/env-config/route.ts`
- Modify: `src/app/settings/page.tsx`（与 Task 5 协调）
- Modify: `scripts/ping.ts` / `scripts/prompt-eval.ts` / `scripts/m3-smoke.ts`
- Modify: `docs/v1.0.0/Deploying.md`

**背景：** 当前第三个供应商 `sensenova` 是 SenseNova（商汤）的特化实现 — `sensenova.ts` 内部就是 `OpenAICompatProvider` 的薄包装，仅预设了 `baseURL: 'https://token.sensenova.cn/v1'` 和 `model: 'deepseek-v4-flash'`。将其改为通用"OpenAI 兼容"供应商：不预设 base URL（用户必填），适配任意 OpenAI 兼容端点（如 OpenRouter、Together AI、本地 Ollama、LM Studio 等）。同时把默认供应商从 `sensenova` 改为 `deepseek`。

**安全保障：** `ProviderKind` 是 discriminated union，`createProvider()` 使用 exhaustive switch（`const _: never = x`）。改完 `ProviderKind` 后跑 `bun run typecheck`，编译器会在所有未更新的 switch / Record / 条件判断处报错。

- [ ] **Step 1: 更新 ProviderKind**

In `src/lib/providers/types.ts`:

```ts
// 改前
export type ProviderKind = 'deepseek' | 'glm' | 'sensenova'
// 改后
export type ProviderKind = 'deepseek' | 'glm' | 'openai-compat'
```

- [ ] **Step 2: 重命名 sensenova.ts → openai-compat-provider.ts**

Rename file, then rewrite:

```ts
// src/lib/providers/openai-compat-provider.ts

import { OpenAICompatProvider } from './openai-compat'
import type { LLMConfig, LLMProvider } from './types'

/**
 * OpenAI 兼容供应商默认配置。
 * 不预设 baseURL 和 model — 用户必须通过 Settings 或环境变量提供。
 */
export const openaiCompatDefaults = {
  temperature: 0.7,
} as const

/**
 * 创建 OpenAI 兼容 Provider。
 *
 * 适配任意兼容 OpenAI Chat Completions API 的端点：
 * OpenRouter / Together AI / Groq / 本地 Ollama / LM Studio 等。
 *
 * @param config 用户提供的配置（apiKey + baseURL + model 均必填）
 * @throws Error 当 baseURL 缺失
 */
export function createOpenAICompatProvider(config: LLMConfig): LLMProvider {
  if (config.provider !== 'openai-compat') {
    throw new Error(
      `createOpenAICompatProvider called with provider='${config.provider}', expected 'openai-compat'`,
    )
  }
  if (!config.baseURL) {
    throw new Error('OpenAI 兼容供应商必须提供 baseURL（在 Settings 中配置）')
  }
  return new OpenAICompatProvider({
    ...openaiCompatDefaults,
    ...config,
  })
}
```

> **注意：** `openai-compat.ts`（`OpenAICompatProvider` 基础类）保持不变。新的 `openai-compat-provider.ts` 是 provider factory 入口，与 `deepseek.ts` / `glm.ts` 同级。

- [ ] **Step 3: 更新 factory 与 exports**

In `src/lib/providers/index.ts`:

```ts
// import 更名
import { createOpenAICompatProvider } from './openai-compat-provider'

// exports 更名
export { createOpenAICompatProvider, openaiCompatDefaults } from './openai-compat-provider'
// 移除 sensenova 相关 export

// factory case 更名
case 'openai-compat':
  return createOpenAICompatProvider(config)

// isSupportedProvider 更名
export function isSupportedProvider(kind: unknown): kind is ProviderKind {
  return kind === 'deepseek' || kind === 'glm' || kind === 'openai-compat'
}

// error message 更名
throw new Error(
  `Unsupported provider: ${exhaustive as string} (known: deepseek, glm, openai-compat)`,
)
```

- [ ] **Step 4: 更新 env-config 路由**

In `src/app/api/env-config/route.ts`:

```ts
// 默认供应商改为 deepseek
const provider = (process.env.DEFAULT_LLM_PROVIDER ?? 'deepseek') as ProviderKind
const model = process.env.DEFAULT_LLM_MODEL ?? 'deepseek-chat'

// PROVIDER_DEFAULT_BASE_URL
const PROVIDER_DEFAULT_BASE_URL: Record<ProviderKind, string> = {
  deepseek: 'https://api.deepseek.com',
  glm: 'https://open.bigmodel.cn/api/coding/paas/v4',
  'openai-compat': '', // 无默认值，用户必须提供
}

// readAllApiKeys
function readAllApiKeys(): Record<ProviderKind, string | null> {
  return {
    deepseek: process.env.DEEPSEEK_API_KEY ?? null,
    glm: process.env.GLM_API_KEY ?? null,
    'openai-compat': process.env.OPENAI_COMPAT_API_KEY ?? null,
  }
}

// baseURLByProvider
const baseURLByProvider: Record<ProviderKind, string | undefined> = {
  deepseek: process.env.DEEPSEEK_BASE_URL,
  glm: process.env.GLM_BASE_URL,
  'openai-compat': process.env.OPENAI_COMPAT_BASE_URL,
}
```

> **注意：** `openai-compat` 的 `PROVIDER_DEFAULT_BASE_URL` 为空字符串。当默认 provider 是 `deepseek` 时，`apiKey = allApiKeys['deepseek']`，不涉及 openai-compat。用户在 Settings 切换到 `openai-compat` 时，必须手动填写 baseURL。

- [ ] **Step 5: 更新 Settings 页 provider 选择器**

In `src/app/settings/page.tsx`（或 Task 5 拆分后的 `ProductionSettings.tsx`）:

- Provider 选择器选项：`sensenova` → `openai-compat`
- 选项 label：`"SenseNova（商汤）"` → `"OpenAI 兼容"`
- `PROVIDER_DEFAULTS` 更新：移除 sensenova 的预设 baseURL/model；openai-compat 的 baseURL 和 model 留空（用户必填）
- 切换到 `openai-compat` 时：baseURL 输入框为空 + 显示提示"请输入 OpenAI 兼容端点 URL"

- [ ] **Step 6: 更新 CLI 脚本**

In `scripts/ping.ts` / `scripts/prompt-eval.ts` / `scripts/m3-smoke.ts`:

- Provider 枚举：`sensenova` → `openai-compat`
- 环境变量：`SENSENOVA_API_KEY` → `OPENAI_COMPAT_API_KEY`，`SENSENOVA_BASE_URL` → `OPENAI_COMPAT_BASE_URL`
- `prompt-eval.ts` 中的 `buildLLMConfig` 分支更新

- [ ] **Step 7: 更新 Deploying.md**

In `docs/v1.0.0/Deploying.md`:

环境变量表更新：

```bash
# 必须配置（默认）
DEFAULT_LLM_PROVIDER=deepseek        # 改自 sensenova
DEFAULT_LLM_MODEL=deepseek-chat      # 改自 deepseek-v4-flash
DEEPSEEK_API_KEY=your_key

# 可选配置
OPENAI_COMPAT_API_KEY=your_key       # 改自 SENSENOVA_API_KEY
OPENAI_COMPAT_BASE_URL=https://...   # 改自 SENSENOVA_BASE_URL（openai-compat 必填）
GLM_API_KEY=your_key
```

- [ ] **Step 8: typecheck 驱动的全量修正**

Run: `bun run typecheck`

TypeScript 会在所有未更新的 `ProviderKind` exhaustive switch / `Record<ProviderKind, ...>` 处报错。逐一修正直到 0 errors。

> **这是供应商重构的安全网** — `const _: never = x` 模式确保编译器不会放过任何遗漏点。常见报错位置：API 路由中的 provider 特化逻辑、CLI 脚本中的条件分支。

- [ ] **Step 9: 测试**

Run: `bun run typecheck && bun run lint && bun run test && bun run ping`

- `bun run ping`：确认 deepseek（默认）和 glm 通道健康。
- 如配置了 `OPENAI_COMPAT_API_KEY` + `OPENAI_COMPAT_BASE_URL`：手动在 Settings 切换到 openai-compat 并 ping 测试。

---

### Task 9: E2E 与最终验证

**Files:**
- Modify: `e2e/smoke.spec.ts`
- Create: `docs/v1.0.0/M8-Review.md`（实现完成后撰写）

- [ ] **Step 1: Unit test suite**

Run: `bun run test`

Expected: all existing + new tests pass（app-mode / showcase-loader / mock-compile-events）。

- [ ] **Step 2: Type and lint**

Run: `bun run typecheck && bun run lint`

Expected: 0 errors。

- [ ] **Step 3: Production 模式回归**

本地不设 `NEXT_PUBLIC_APP_MODE`（默认 production）：

Run: `bun run dev`

验证：
- `/` 渲染实用首页（智能路由，"开始学习"按钮）
- `/settings` 渲染完整 Settings（API Key 输入框）
- `/studio` 渲染实用首页（与 `/` 一致）
- `EnvConfigLoader` 正常工作（Settings 页自动填充 env-config Key）
- 所有 M7.8 功能不受影响

- [ ] **Step 4: Showcase 模式验证**

设置 `NEXT_PUBLIC_APP_MODE=showcase`：

```bash
NEXT_PUBLIC_APP_MODE=showcase bun run dev
# 或在 .env.local 中临时设置
```

验证：
- `/` 渲染展示首页（题库列表 + "模拟编译"按钮）
- `/settings` 渲染纯信息页（无 API Key 输入）
- 点击"模拟编译" → 8 阶段动画 → 跳转 `/learn/module/[id]`
- 点击题库卡片"开始学习" → 加载题库 → 跳转学习页
- 学习页答题正常（本地判分）
- 全局导航不显示"导入新内容"
- `/studio` 渲染实用首页
- `/studio/settings` 渲染完整 Settings（可输入 API Key）
- Network 面板无 `/api/env-config` 请求（EnvConfigLoader 未挂载）
- Network 面板无 `/api/compile` 请求（模拟编译不调 LLM）

- [ ] **Step 5: Playwright smoke**

Run: `bun run e2e`

补充用例：
- 展示首页渲染、模拟编译完整流程、题库卡片点击
- `/studio` 在两种模式下均可访问
- **供应商重构**：Settings 页 provider 选项为 DeepSeek / GLM / OpenAI 兼容（无 SenseNova）；默认 provider 为 deepseek

> **注意：** Playwright 默认在 production 模式运行。如需测试 showcase 模式，需设置环境变量后单独运行一次：`NEXT_PUBLIC_APP_MODE=showcase bun run e2e`。

- [ ] **Step 6: Vercel 部署验证**

1. Vercel Project → Settings → Environment Variables → 新增 `NEXT_PUBLIC_APP_MODE=showcase`
2. Redeploy
3. 访问 Vercel URL：
   - `/` 显示展示首页
   - `/studio` 显示实用首页
   - 模拟编译流程完整
   - Network 无 `/api/env-config` 请求
4. 确认 Vercel 函数日志无 `/api/compile` 调用（展示模式不编译）

- [ ] **Step 7: 撰写 Review**

Create `docs/v1.0.0/M8-Review.md`:
- 已实现任务清单
- 验证命令与结果
- 已知限制
- V1.1 衔接建议

---

## 5. Acceptance Criteria

| Area | Acceptance |
|---|---|
| 模式判定 | `NEXT_PUBLIC_APP_MODE=showcase` → `isShowcaseMode === true`；未设 → `isProductionMode === true`；构建时 inline |
| 展示首页 | Showcase 模式下 `/` 渲染题库列表 + 模拟编译按钮；卡片点击进入学习；底部有 `/studio` 链接 |
| 模拟编译 | 8 阶段动画依次显示（约 12s）；完成后加载 featured 题库；跳转 `/learn/module/[id]`；全程不调 `/api/compile` |
| 展示题库 | `public/showcase-modules/` 至少 1 个 `.alc-module.json`；通过 `parseModulePackage` 校验；`importModulePackage` 加载成功 |
| 展示 Settings | Showcase 模式下 `/settings` 显示纯信息页；无 API Key 输入；列出可用题库；有 `/studio` 链接 |
| EnvConfigLoader | Showcase 模式下根 layout 不渲染 `EnvConfigLoader`；Network 无 `/api/env-config` 请求 |
| `/studio` 路由 | 两种模式下 `/studio` 均渲染实用首页；`/studio/settings` 均渲染完整 Settings |
| 导航适配 | Showcase 模式下 GlobalNav 不显示"导入新内容"；其余导航项正常 |
| Production 回归 | Production 模式下所有 M7.8 功能不变；`/` 智能路由正常；Settings 完整 |
| 供应商重构 | `ProviderKind` 为 `deepseek \| glm \| openai-compat`；无 sensenova；默认 provider 为 deepseek；openai-compat 不预设 baseURL；`bun run typecheck` 0 errors |
| 验证 | `bun run typecheck`、`bun run lint`、`bun run test`、`bun run e2e` 全部通过 |

---

## 6. 风险登记与缓解

| Risk | Impact | Mitigation |
|---|---|---|
| `NEXT_PUBLIC_APP_MODE` 在 Vercel 上忘记配置 | Vercel 仍然渲染实用首页，访客消耗 API Key | Deploying.md 文档强调；M8-Review 检查清单包含此项；首次部署后必须验证 |
| 展示题库 JSON 质量差（编译产物有误） | 展示效果差，影响产品形象 | 展示题库必须先在实用模式中编译 + 完整学习验证后再导出；至少跑完一遍答题+费曼 |
| 模拟编译动画时长不合理（太长无聊 / 太短看不清） | 用户体验差 | 默认 1.5s/阶段（总 12s）；Should 项加"跳过"按钮；内测反馈后调整 `STAGE_DURATION_MS` |
| 展示模式下学习页调用 `/api/feedback` 无 config | LLM 反馈失败，降级为纯本地判分 | 可接受降级（本地判分已能完成答题）；Should 项做 API 路由服务端 env fallback |
| `public/showcase-modules/` 文件体积大（多题库） | 首屏加载慢 | manifest 先加载，题库 JSON 按需 fetch（用户点击时才加载）；单题库 JSON < 100KB |
| `/studio` 在展示模式下被访客发现并滥用 API Key | API Key 仍可能被消耗 | `/studio` 链接低调（仅展示 Settings 底部 + 展示首页底部小字）；Should 项加 `/studio` 路由的 rate limit 或简单密码保护 |
| Server Component 条件渲染 Client Component 导致 hydration mismatch | 运行时报错 | `isShowcaseMode` 是构建时 inline 的常量，server/client 一致；不存在 hydration 问题 |
| 展示题库 `importModulePackage` 每次分配新 ID | 用户多次"模拟编译"产生重复 Module | 设计预期：每次模拟编译是新会话；题库页可手动删除旧副本；Should 项可加 dedup 逻辑 |
| 供应商重构遗漏更新点 | 运行时 `Unsupported provider` 错误 | `ProviderKind` exhaustive switch 编译期检查；`bun run typecheck` 是安全网；所有遗漏点会编译报错 |
| openai-compat 用户不填 baseURL | 运行时 `OpenAI 兼容供应商必须提供 baseURL` 报错 | Settings 页切换到 openai-compat 时 baseURL 输入框高亮必填；`createOpenAICompatProvider` 构造时即校验 |
| 现有 Vercel 环境变量 `SENSENOVA_API_KEY` 失效 | 部署后默认 deepseek 但未配 `DEEPSEEK_API_KEY` → 编译不可用 | Deploying.md 更新环境变量表；Vercel 部署验证清单包含此项；M8-Review 检查清单提醒更新 Vercel env vars |

---

## 7. 待确认的产品决策

1. **`/studio` 路由命名**：当前用 `/studio`（工作室含义）。备选：`/admin`、`/dev`、`/manage`、`/workshop`。建议：`/studio`，语义中性且不暗示管理员权限。

2. **展示模式下 LLM 增强反馈**：展示题库学习时是否需要 LLM 反馈（`/api/feedback` / `/api/feynman-eval`）？建议：M8 不做 API fallback（本地判分够演示），V1.1 再加。

3. **模拟编译"跳过"按钮**：是否在 Must 中加入？建议：M8 Must 不加，观察内测反馈。如果用户觉得 12s 太长再加。

4. **展示题库数量**：M8 Must 要求 1 个还是 3-5 个？建议：Must 1 个验证流程，Should 扩展到 3-5 个覆盖不同学科（编程 / 科学 / 人文）。

5. **`/studio` 是否需要访问保护**：展示模式下 `/studio` 暴露实用首页，虽无 API Key 但可能被滥用。建议：M8 不加保护（链接低调即可）；V1.1 如需可加简单的 Vercel Password Protection 或 Basic Auth middleware。

6. **展示模式埋点属性**：M7.8 的 `analytics.ts` 是否需要在事件中新增 `app_mode` 属性？建议：Should 项，便于区分展示访客与实用用户的行为数据。

7. **OpenAI 兼容供应商环境变量命名**：当前建议 `OPENAI_COMPAT_API_KEY` / `OPENAI_COMPAT_BASE_URL`。备选：`OPENAI_API_KEY`（暗示官方 OpenAI，可能有歧义）。建议：`OPENAI_COMPAT_*`，语义明确"兼容端点"。

8. **OpenAI 兼容供应商是否保留 `extraBody` 透传**：当前 `OpenAICompatProvider` 已支持 `extraBody`（GLM 的 `enable_thinking` 等私有字段）。建议：保留，用户可通过 extraBody 适配非标端点。

---

## 8. 与 V1.1 的衔接

M8 完成后，后续里程碑应优先处理：

1. **API 路由服务端 env fallback**：`/api/feedback` / `/api/feynman-eval` 在请求体 config 为空时 fallback 到环境变量。让展示模式也获得 LLM 增强反馈。
2. **展示题库扩充**：编译 3-5 个高质量题库（覆盖不同学科），丰富展示首页。
3. **`/studio` 访问保护**：Vercel Password Protection 或 middleware 层 Basic Auth。
4. **展示模式独立 branding**：展示首页可定制 hero 文案 / 配色（与实用首页区分）。
5. **运行时题库管理**：引入轻量后端（如 Vercel KV / Supabase）支持运行时上传展示题库，无需重新部署。
6. **编译成功率验证**：≥10 次真实编译（通过 `/studio` 在 Vercel 上执行），统计 NFR-R1 ≥95%。
7. **内测执行**：20 人内测 + 北极星指标基线（PRD-Report §8.4）。

---

## 9. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-10 | 初稿。基于 M7.8 完成后的 Vercel 部署现状，新增展示模式（`NEXT_PUBLIC_APP_MODE`）、展示题库静态分发（`public/showcase-modules/`）、模拟编译（合成 `CompileEvent`）、展示 Settings 信息页、`/studio` 实用页保留路由。 | Sisyphus |
| 1.1 | 2026-07-10 | 补充 Task 8 供应商重构：`sensenova` → `openai-compat`（通用 OpenAI 兼容端点），默认供应商改为 `deepseek`，环境变量 `SENSENOVA_*` → `OPENAI_COMPAT_*`。原验证 Task 顺延为 Task 9。 | Sisyphus |
