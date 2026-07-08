# 开发者指南 (Dev Guide)

> 面向开发者的实操手册：从零开始跑通项目，理解架构，调试问题。

---

## 1. 环境要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 20.x | Next.js 运行时 |
| Bun | >= 1.1.x | 包管理 + 脚本运行 |
| Git | >= 2.x | 版本控制 |

本仓库**用 Bun 管理依赖和运行脚本**，不使用 npm/yarn/pnpm。

## 2. 快速开始

```bash
# 1. 克隆仓库
git clone <repo-url>
cd Milo-isLearning

# 2. 安装依赖
bun install

# 3. 复制环境变量模板（脚本运行用，Web 开发不强制）
cp .env.example .env.local

# 4. 启动开发服务器
bun run dev
```

开发服务器启动后访问 http://localhost:3000。

## 3. 首次配置 LLM（必须）

项目依赖 LLM 进行知识编译。有两种配置方式：

### 方式 A：通过 `.env.local` 自动加载（推荐，开发者首选）

1. 复制环境变量模板：
   ```bash
   cp .env.example .env.local
   ```
2. 编辑 `.env.local`，填入 API Key 和默认供应商：
   ```bash
   DEFAULT_LLM_PROVIDER=sensenova        # 或 deepseek / glm
   DEFAULT_LLM_MODEL=deepseek-v4-flash   # 随供应商走对应模型
   SENSENOVA_API_KEY=sk-xxx              # 填入真实 Key
   ```
3. 运行 `bun run dev`
4. 打开 http://localhost:3000 — 配置会**自动加载**到 Settings 中，无需手动操作

> 自动加载逻辑：应用启动时 `EnvConfigLoader` 组件调用 `GET /api/env-config`，服务端从 `process.env` 读取配置返回。如果 LocalStorage 中已有配置（用户手动保存过），则不覆盖。

### 方式 B：通过 Settings 页手动配置

1. 打开 http://localhost:3000
2. 点击首页的「设置」按钮
3. 选择供应商（三选一）：

| 供应商 | 适用场景 | 获取 API Key |
|--------|---------|-------------|
| DeepSeek | 原生 DeepSeek API | https://platform.deepseek.com |
| GLM (智谱) | 智谱 Coding Plan | https://open.bigmodel.cn |
| SenseNova (商汤) | 商汤托管通道 | https://token.sensenova.cn |

4. 填入 API Key
5. 模型名和 baseURL 会自动填充默认值，可按需修改
6. 点击「测试连接」验证配置是否有效
7. 点击「保存配置」
8. 配置保存后，页面底部会出现「前往导入知识」入口

> **安全说明**：API Key 仅存储在浏览器 LocalStorage 中，不会上传到服务器数据库。API 调用时通过 HTTPS Header 传递给 LLM 供应商。
>
> **优先级**：LocalStorage 中手动保存的配置 > `.env.local` 环境变量配置。两者都有时以手动配置为准。

## 4. 开发命令一览

```bash
# --- 开发服务器 ---
bun run dev              # 启动 Next.js dev server (localhost:3000)
bun run build            # 生产构建
bun run start            # 启动生产服务器（需先 build）

# --- 代码质量 ---
bun run typecheck        # TypeScript 类型检查 (tsc --noEmit)
bun run lint             # ESLint 检查
bun run lint:fix         # ESLint 自动修复
bun run format           # Prettier 格式化全部文件
bun run format:check     # Prettier 格式检查（不修改）

# --- 测试 ---
bun run test             # 运行全部单元测试 (vitest)
bun run test:watch       # 监听模式运行测试
bun run e2e              # 运行 E2E 测试 (Playwright)

# --- LLM 调试脚本 ---
bun run ping             # 测试 LLM 连接（需先配置 .env.local）
bun run eval             # Prompt 评估工具
bun --env-file=.env.local run scripts/m3-smoke.ts  # 端到端编译冒烟测试
```

### 4.1 脚本说明

| 脚本 | 位置 | 用途 |
|------|------|------|
| `ping.ts` | `scripts/ping.ts` | 命令行测试 LLM 连接，需 `.env.local` 中配置 API Key |
| `prompt-eval.ts` | `scripts/prompt-eval.ts` | 评估各 Agent 的 prompt 输出质量 |
| `m3-smoke.ts` | `scripts/m3-smoke.ts` | 端到端编译冒烟测试：输入 Markdown → 输出完整 Module |

脚本的运行方式与 Web 开发不同：

```bash
# 脚本通过 .env.local 读取 API Key（不通过浏览器 Settings）
bun --env-file=.env.local run scripts/ping.ts

# Web 开发通过 Settings 页配置（存入 LocalStorage）
bun run dev
```

## 5. 项目架构

### 5.1 目录结构

```
src/
├── app/                        # Next.js App Router
│   ├── api/                    # API Routes（服务端）
│   │   ├── compile/            #   POST /api/compile — 编译 Markdown → Module (SSE)
│   │   ├── feedback/           #   POST /api/feedback — 答题评分
│   │   ├── feynman-eval/       #   POST /api/feynman-eval — 费曼最终输出评分
│   │   ├── regenerate/         #   POST /api/regenerate — 答错换题
│   │   └── ping/               #   POST /api/ping — LLM 连接测试
│   ├── learn/                  # 学习流程页面
│   │   ├── import/             #   导入 Markdown
│   │   ├── compiling/          #   编译中（SSE 进度）
│   │   ├── overview/           #   编译完成概览
│   │   ├── module/[id]/        #   学习页面（状态机路由器）
│   │   └── done/               #   完成页（掌握度报告）
│   ├── settings/               # LLM 配置页
│   └── page.tsx                # 首页
├── components/
│   ├── learn/                  # 学习视图组件
│   │   ├── ModuleIntroView     #   Module 导言
│   │   ├── ConceptView         #   Concept 学习（逐题作答）
│   │   ├── ChallengeView       #   Module Challenge（跨概念综合题）
│   │   ├── FeynmanIntroView    #   费曼导言
│   │   ├── FeynmanStepView     #   费曼步骤 1-5
│   │   └── FeynmanFinalView    #   费曼最终输出
│   └── quiz/                   # 题型组件
│       ├── ChoiceQuiz          #   4 选项单选
│       ├── SortingQuiz         #   拖拽排序
│       ├── FillBlankQuiz       #   填空
│       ├── QuizRenderer        #   按 interactionType 分发
│       └── FeedbackPanel       #   答题反馈面板
├── lib/
│   ├── compiler/               # 知识编译器
│   │   ├── agents/             #   Agent 运行器 + 输出映射
│   │   ├── pipeline/           #   编译 pipeline（8 阶段流水线）
│   │   ├── prompts/            #   Prompt 模板 (.md) + 构建器
│   │   └── schemas/            #   Zod 输出校验 Schema
│   ├── providers/              # LLM 供应商抽象层
│   │   ├── types.ts            #   LLMConfig / LLMProvider 接口
│   │   ├── openai-compat.ts    #   OpenAI 兼容协议实现
│   │   ├── deepseek.ts         #   DeepSeek 工厂
│   │   ├── glm.ts              #   GLM 工厂
│   │   └── sensenova.ts        #   SenseNova 工厂
│   ├── state/                  # Zustand 状态管理（前端）
│   │   ├── settings-store      #   LLM 配置
│   │   ├── module-store        #   当前 Module + Quiz
│   │   ├── progress-store      #   学习状态机
│   │   ├── attempts-store      #   作答历史
│   │   └── compile-store       #   编译过程状态
│   ├── persistence/            # LocalStorage 持久化
│   ├── runtime/                # 运行时纯函数
│   │   ├── mastery.ts          #   掌握度计算
│   │   ├── retry-policy.ts     #   重试策略（3 次失败强制推进）
│   │   └── fill-blank.ts       #   填空题标准化匹配
│   └── hooks/                  # React Hooks
├── types/
│   └── domain.ts               # 领域模型（Module / Concept / Quiz / Mastery 等）
```

### 5.2 核心数据流

```
用户粘贴 Markdown
       │
       ▼
  /learn/import  ──→  sessionStorage  ──→  /learn/compiling
                                              │
                                    POST /api/compile (SSE)
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                   ▼                   ▼
                   Pipeline Stage 1-7    Challenge Stage 6.5    Feynman Stage 7
                   (import→chunk→       (跨概念综合题)         (6步费曼任务)
                    concept→module→
                    mission→quiz)
                          │
                          ▼
                    完整 Module 产物
                    (写入 LocalStorage)
                          │
                          ▼
                    /learn/overview
                          │
                          ▼
               /learn/module/[id] (状态机路由器)
                          │
              ┌───────────┼───────────┬───────────┐
              ▼           ▼           ▼           ▼
         ModuleIntro  ConceptView  ChallengeView  FeynmanViews
              │           │           │           │
              ▼           ▼           ▼           ▼
                    /learn/done (完成页)
```

### 5.3 编译 Pipeline（8 阶段）

| Stage | 名称 | 进度 | Agent | 说明 |
|-------|------|------|-------|------|
| 1 | import | 25% | import | 文本清洗标准化 |
| 2 | chunk | 40% | chunk | 知识块切分 |
| 3 | concept | 55% | concept | 核心概念提取 |
| 4 | module | 65% | module | 学习模块构建 |
| 5 | mission | 70% | mission | 练习序列规划 |
| 6 | quiz | 80-95% | quiz-batch | 按 Concept 分组生成练习题 |
| 6.5 | challenge | 96% | challenge-batch | 跨概念综合题（M6 新增） |
| 7 | feynman | 100% | feynman | 费曼任务设计 |

每个 Stage 通过 `runAgent()` 调用 LLM，输出经 Zod Schema 校验。失败有自动重试（瞬时错误最多 3 次，指数退避）。

### 5.4 学习状态机

```
module_intro → concept(0,0) → ... → concept(N,M) → challenge(0) → ... → challenge(K)
    │                                                              │
    └── (无 challengeQuizzes 时直接跳到 feynman) ──────────────────┤
                                                                   ▼
                                                          feynman_intro
                                                               │
                                                   ┌───────────┼───────────┐
                                                   ▼           ▼           ▼
                                              feynman_step  feynman_step  feynman_final → done
                                                (1-5)        (1-5)
```

状态存储在 `progress-store`（Zustand + persist），刷新页面后自动恢复。

## 6. 调试指南

### 6.1 调试 LLM 连接

**Web UI 方式**（推荐）：
1. 访问 http://localhost:3000/settings
2. 填入配置 → 点击「测试连接」
3. 查看返回的延迟和状态

**命令行方式**：
```bash
# 1. 在 .env.local 中填入 API Key
#    SENSENOVA_API_KEY=sk-xxx
#    或 DEEPSEEK_API_KEY=sk-xxx
#    或 GLM_API_KEY=sk-xxx

# 2. 运行 ping 脚本
bun --env-file=.env.local run scripts/ping.ts
```

### 6.2 调试编译流程

**端到端冒烟测试**：
```bash
bun --env-file=.env.local run scripts/m3-smoke.ts
```
此脚本会：输入一段 Markdown → 运行完整 Pipeline → 输出 Module JSON。用于验证编译流程是否正常。

**浏览器 DevTools 调试**：
1. 打开 http://localhost:3000/learn/import
2. 粘贴 Markdown（200-20000 字）
3. 点击「开始编译」
4. 打开 DevTools → Network 标签
5. 查看 `/api/compile` 请求的 Event Stream（SSE 事件）
6. 每个 `stage_enter` / `progress` / `complete` / `error` 事件都会显示

**查看编译产物**：
编译完成后，Module JSON 存储在 LocalStorage：
```javascript
// 在浏览器 Console 中执行
const module = JSON.parse(localStorage.getItem('alc:module:module-1'))
console.log(module.title, module.concepts.length, module.challengeQuizzes?.length)
```

### 6.3 调试前端状态

所有状态管理使用 Zustand + persist，可在 Console 中直接读取：

```javascript
// 查看当前学习进度
JSON.parse(localStorage.getItem('alc:state:progress'))

// 查看当前 Module
JSON.parse(localStorage.getItem('alc:state:module'))

// 查看作答历史
JSON.parse(localStorage.getItem('alc:state:attempts'))

// 查看 LLM 配置
JSON.parse(localStorage.getItem('alc:settings'))
```

### 6.4 调试 API Routes

API Routes 在 `src/app/api/` 下，使用 Next.js Route Handlers。

调试方式：
1. 在 route 文件中添加 `console.log` / `console.error`
2. 开发服务器会自动重启
3. 查看终端输出

或在 DevTools Network 中查看请求/响应。

### 6.5 调试 Prompt

**查看 Prompt 模板**：
所有 prompt 在 `src/lib/compiler/prompts/*.md`，使用 `## System` / `## User` 分段。

**评估 Prompt 质量**：
```bash
# 评估单个 Agent 的 prompt 输出
bun --env-file=.env.local run scripts/prompt-eval.ts --agent concept --provider sensenova

# 可选 Agent: import | chunk | concept | module | mission | quiz | quiz-batch | challenge-batch | feynman | feedback | feynman-eval
```

### 6.6 常见问题排查

#### 编译失败：LLM 输出不规范

**现象**：编译中页显示「AI 输出不规范」错误。

**原因**：LLM 返回的 JSON 不符合 Schema 校验。

**排查**：
1. 查看终端输出（开发服务器控制台会打印 Zod 校验错误详情）
2. 尝试更换模型（如 `deepseek-v4-flash` → `deepseek-v4-pro`）
3. 检查网络是否稳定（瞬时错误会自动重试 3 次）

#### 编译失败：429 Rate Limit

**现象**：HTTP 429 错误。

**解决**：降低请求频率或更换 API Key / 供应商。

#### 编译失败：超时

**现象**：请求超时（默认 600 秒）。

**原因**：模型 thinking 模式消耗过多时间。

**解决**：Pipeline 默认关闭 thinking 模式。如仍超时，尝试使用更快的模型（如 `deepseek-v4-flash` 而非 `deepseek-v4-pro`）。

#### 页面空白 / 状态丢失

**现象**：刷新后学习进度丢失或页面空白。

**排查**：
1. 检查 LocalStorage 是否被清除（DevTools → Application → Local Storage）
2. 确认 `alc:state:progress` 和 `alc:state:module` 存在
3. 如果 Module 数据损坏，清除后重新编译：
   ```javascript
   localStorage.clear()
   location.reload()
   ```

#### Settings 页 ping 失败

**现象**：Settings 页「测试连接」返回失败。

**排查**：
1. 确认 API Key 正确（检查前4位和后4位）
2. 确认 baseURL 正确（不要带多余的 `/`）
3. 查看 Network 中 `/api/ping` 请求的响应体
4. 尝试用命令行脚本验证：`bun --env-file=.env.local run scripts/ping.ts`

## 7. 测试

### 7.1 单元测试

```bash
bun run test              # 运行全部测试
bun run test:watch        # 监听模式
```

测试文件在 `src/lib/**/__tests__/` 下，使用 Vitest。

主要测试覆盖：
- `mastery.test.ts` — 掌握度计算
- `retry-policy.test.ts` — 重试策略
- `fill-blank.test.ts` — 填空题匹配
- `pipeline.test.ts` — 编译 pipeline（mock LLM）
- `smoke.test.ts` — Schema 校验
- `builder.test.ts` — Prompt 模板构建
- `mappers.test.ts` — Agent 输出映射
- `runner.test.ts` — Agent 运行器（mock）
- `quota.test.ts` — LocalStorage 配额
- `openai-compat.test.ts` — Provider 协议

### 7.2 E2E 测试

```bash
bun run e2e
```

使用 Playwright，测试文件在 `e2e/` 目录。

### 7.3 添加新测试

```bash
# 单元测试示例
# src/lib/runtime/__tests__/my-test.test.ts
import { describe, it, expect } from 'vitest'

describe('my function', () => {
  it('should work', () => {
    expect(true).toBe(true)
  })
})
```

## 8. 代码规范

### 8.1 提交前检查

提交前自动运行（husky + lint-staged）：
- Prettier 格式化
- ESLint 修复

手动检查：
```bash
bun run typecheck   # 类型检查
bun run lint        # Lint 检查
bun run test        # 单元测试
```

### 8.2 代码风格

- TypeScript strict mode（不允许 `as any` / `@ts-ignore`）
- Prettier 格式化（配置在 `.prettierrc.json`）
- ESLint 配置在 `eslint.config.mjs`
- 不使用 `console.log`（使用 `console.warn` / `console.error`）

### 8.3 项目约定

- **Python 脚本**：不直接使用 `python`，使用 `uv run` 运行（本仓库当前无 Python 脚本）
- **Node 脚本**：使用 `bun run` 运行
- **环境变量**：复制 `.env.example` 为 `.env.local`，真实 key 绝不 commit
- **忽略目录**：`uv/` / `.venv/` / `*_old/` / `*.bat`（见 `.gitignore`）

## 9. 完整开发流程示例

以下是从零到走通全流程的完整步骤：

```bash
# 1. 安装
bun install

# 2. 配置环境变量（.env.local 方式，推荐）
cp .env.example .env.local
# 编辑 .env.local，填入：
#   DEFAULT_LLM_PROVIDER=sensenova
#   DEFAULT_LLM_MODEL=deepseek-v4-flash
#   SENSENOVA_API_KEY=sk-xxx

# 3. 启动开发服务器
bun run dev
# → 配置自动从 .env.local 加载到 Settings，无需手动在 UI 中输入

# 4. 导入知识
#    访问 http://localhost:3000 → 「开始学习」→ 粘贴 Markdown → 开始编译

# 5. 学习流程
#    编译完成 → 概览 → 开始学习 → Concept 逐题 → Challenge 综合题 → 费曼 → 完成

# 6. 命令行验证（可选）
bun --env-file=.env.local run scripts/ping.ts        # 验证连接
bun --env-file=.env.local run scripts/m3-smoke.ts     # 端到端冒烟
bun run test                                          # 运行测试
bun run typecheck                                     # 类型检查
```

## 10. 参考文档

| 文档 | 位置 | 内容 |
|------|------|------|
| PRD | `docs/PRD.md` | 产品需求文档（功能需求 + 验收标准） |
| Technical Spec | `docs/Technical-Specification.md` | 技术规格（架构 + 数据模型 + 状态机） |
| Prompt Engineering | `docs/Prompt-Engineering.md` | Prompt 设计规范 |
| M6 Plan | `docs/M6-Plan.md` | M6 里程碑计划（当前） |
| M4-M5 Review | `docs/M4-M5-Review.md` | M4-M5 交付审查 |
