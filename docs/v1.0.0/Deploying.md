# Vercel 部署指南

> **适用版本**：PRD V2.0 / M7.8+
> **最后验证**：2026-07-10，基于 Vercel 官方文档（Fluid Compute 更新后）

## 概述

本项目（ai-learning-compiler）是 Next.js 15 + React 19 应用，零后端架构：

- **6 个无状态 API 路由**：代理 LLM 调用（DeepSeek / GLM / SenseNova）
- **LocalStorage 客户端存储**：所有用户数据留在浏览器，服务端不持久化
- **SSE 流式编译**：`/api/compile` 使用 `text/event-stream` 实时推送 8 阶段编译进度

Vercel 是该架构的理想部署平台——无需数据库、无需 WebSocket、无需服务端会话状态。

## 前置条件

| 条目 | 要求 |
|------|------|
| GitHub 仓库 | 代码已推送至 GitHub（Vercel 通过 Git 集成自动部署） |
| LLM API Key | 至少一个供应商的密钥（推荐 SenseNova 默认通道） |
| Vercel 账号 | [vercel.com](https://vercel.com) 注册（Hobby 免费计划即可） |
| Node.js | 本地开发用 20.x+（Vercel 运行时自动提供） |

## 第一步：创建 Vercel 项目

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 **Add New... → Project**
3. 选择 GitHub 仓库 `Milo-isLearning`（首次需授权 Vercel 访问 GitHub）
4. Framework Preset 自动检测为 **Next.js** — 无需手动修改
5. **先不要点 Deploy** — 需要在下一步配置环境变量

### 构建配置（通常无需修改）

Vercel 自动识别 Next.js 项目，默认配置如下：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| Build Command | `next build` | 标准 Next.js 构建 |
| Output Directory | `.next` | 自动检测 |
| Install Command | `npm install` | 自动检测 package.json |
| Node.js Version | 20.x | 与 `@types/node: ^20.14.0` 匹配 |

> 项目使用 Bun 作为本地开发工具链，但 Vercel 构建使用 npm 即可——`next build` 的输出与包管理器无关。如需在 Vercel 上也使用 Bun，可在 Install Command 中指定 `npm install -g bun && bun install`，但非必需。

## 第二步：环境变量配置

**路径**：Vercel Project → Settings → Environment Variables

### 必须配置

| Key | 示例值 | 说明 |
|-----|--------|------|
| `SENSENOVA_API_KEY` | `sk-xxxxxxxx` | SenseNova（商汤）API 密钥，默认编译通道 |
| `DEFAULT_LLM_PROVIDER` | `sensenova` | 默认供应商，取值：`deepseek` / `glm` / `sensenova` |
| `DEFAULT_LLM_MODEL` | `deepseek-v4-flash` | SenseNova 托管的 DeepSeek 模型（推荐） |

### 可选配置（多供应商冗余）

| Key | 说明 |
|-----|------|
| `DEEPSEEK_API_KEY` | 原生 DeepSeek 通道密钥 |
| `GLM_API_KEY` | 智谱 GLM 通道密钥（Coding Plan 端点） |
| `SENSENOVA_BASE_URL` | 覆盖 SenseNova 默认端点（默认 `https://token.sensenova.cn/v1`） |
| `DEEPSEEK_BASE_URL` | 覆盖 DeepSeek 默认端点（默认 `https://api.deepseek.com`） |
| `GLM_BASE_URL` | 覆盖 GLM 默认端点（默认 Coding Plan 端点） |

### 配置要点

- 每个环境变量可选择作用于 **Production** / **Preview** / **Development** 三个环境
- 建议 Production 和 Preview 都配置（Development 环境本地用 `.env.local`）
- API Key 属于敏感信息，**绝对不要** commit 到代码仓库——`.env.local` 已在 `.gitignore` 中排除
- 配置环境变量后，需要重新部署才会生效（Redeploy 或推送新 commit）

### 工作原理

环境变量通过 `/api/env-config` 路由代理给前端：

```
用户打开应用 → 前端请求 /api/env-config
  → 服务端读取 process.env.SENSENOVA_API_KEY 等
  → 返回 { config: { provider, apiKey, model, baseURL } }
  → 前端 Settings 自动填充，用户无需手动输入
```

API Key 始终在服务端读取，**不会暴露在客户端 bundle 中**。

## 第三步：部署

1. 环境变量配置完成后，回到项目首页
2. 点击 **Deploy**
3. 等待构建完成（通常 1-2 分钟）
4. 部署成功后会获得 `https://<project-name>.vercel.app` 域名

首次部署后，后续每次 `git push` 到 `main` 分支会自动触发生产部署。

## 架构说明

### 函数超时（Fluid Compute）

Vercel 在 2025 年 4 月后将 **Fluid Compute** 设为新项目的默认运行时模型，大幅提升了函数超时上限：

| 计划 | 默认超时 | 最大超时 |
|------|----------|----------|
| Hobby（免费） | 300s（5 分钟） | 300s |
| Pro | 300s | 800s（Pro）/ 1800s（Extended Beta） |
| Enterprise | 300s | 800s / 1800s |

本项目的 `vercel.json` 配置了按路由的超时：

```json
{
  "functions": {
    "app/api/compile/route.ts": { "maxDuration": 60 },
    "app/api/feedback/route.ts": { "maxDuration": 10 },
    "app/api/feynman-eval/route.ts": { "maxDuration": 15 }
  }
}
```

- `/api/compile`（60s）：8 阶段编译流水线，需要足够时间完成 LLM 多轮调用
- `/api/feedback`（10s）：单次答案反馈，LLM 调用通常 2-5s
- `/api/feynman-eval`（15s）：费曼步骤评估，单次 LLM 调用

> **何时调整**：如果编译频繁超时（复杂 Markdown 超过 60s），可将 `compile` 的 `maxDuration` 提高到 120 或 300。Hobby 计划上限为 300s，无需升级即可调整。

### SSE 流式编译

`/api/compile` 使用 Server-Sent Events 实时推送编译进度：

- **运行时**：`runtime = 'nodejs'`（非 Edge——Edge 30s 硬上限无法满足编译需求）
- **流式模式**：服务端立即返回 `text/event-stream` 响应，逐步推送 8 个编译阶段的事件
- **超时行为**：函数超时是指总执行时间，不是单个事件的等待时间。只要函数在 `maxDuration` 内完成全部 8 阶段即可
- **客户端消费**：前端使用 `fetch` + `ReadableStream` 消费 SSE（非 `EventSource`，因为需要 POST 请求体）

> **注意**：不要将 `/api/compile` 改为 `runtime = 'edge'`。Edge Runtime 有 30s 硬上限，且不支持 `fs` 模块读取 Prompt 模板。

### Prompt 文件追踪

编译流水线通过 `fs.readFileSync` 读取 `src/lib/compiler/prompts/*.md` 模板文件。Next.js 的 `outputFileTracingIncludes` 配置确保这些文件被打包进 serverless 函数输出：

```ts
// next.config.ts
outputFileTracingIncludes: {
  '/api/**': ['./src/lib/compiler/prompts/**/*.md'],
}
```

**如果移动了 prompt 文件位置**，必须同步更新此配置，否则生产环境会报 `ENOENT` 错误。

## 部署后验证清单

部署完成后，逐一验证以下功能：

### 基础功能

- [ ] 首页正常加载（无 SSR 报错、样式正常）
- [ ] 暗色主题正确渲染（warm amber 强调色 + serif 字体）
- [ ] 导航到 `/settings`，确认 API Key 已通过 `/api/env-config` 自动填充

### 核心流程

- [ ] **导入 → 编译**：粘贴一段 Markdown，点击编译，观察 SSE 进度事件逐步推送
- [ ] **答题循环**：完成 Concept 的选择题 / 排序题 / 填空题
- [ ] **费曼教学**：完成 6 步费曼教学闭环
- [ ] **完成页**：查看掌握度 + 评分（RatingStars）

### 间隔重复 & 学习工具（M7.8 新增）

- [ ] **错题重刷**：在题库列表点击"重刷错题"，进入复习页面
- [ ] **错题本导出**：在历史记录页点击"导出错题本"，下载 Markdown 文件
- [ ] **间隔重复**：答题时 Concept 内出现复习题（ReviewSlotBadge 标识）
- [ ] **蒙对标记**：FeedbackPanel 的"我猜的"按钮可切换蒙对状态

### 持久化

- [ ] **刷新保持**：刷新浏览器后，学习进度和题库数据不丢失
- [ ] **多标签页**：在不同标签页打开同一 Module，数据同步正常（LocalStorage 事件）

### LLM 供应商

- [ ] **健康检查**：访问 `/api/ping`，确认返回供应商在线状态
- [ ] **切换供应商**：在 Settings 页切换 provider，重新编译验证

## 自定义域名（可选）

1. Vercel Project → Settings → Domains
2. 输入自定义域名（如 `alc.yourdomain.com`）
3. 按提示在域名 DNS 添加 CNAME 记录指向 `cname.vercel-dns.com`
4. Vercel 自动管理 HTTPS 证书（Let's Encrypt）

## 故障排查

### 构建失败

| 症状 | 原因 | 解决 |
|------|------|------|
| `Type error: Cannot find module '@/lib/...'` | 路径别名未识别 | 确认 `tsconfig.json` 的 `paths` 配置，Vercel 自动读取 |
| `Error: ENOENT: no such file ...prompts/` | Prompt 文件未打包 | 确认 `next.config.ts` 的 `outputFileTracingIncludes` 包含 prompts 目录 |
| `Module not found: Can't resolve 'react'` | 依赖未安装 | 确认 `npm install` 在构建前正常执行（检查 Build Log） |

### 运行时错误

| 症状 | 原因 | 解决 |
|------|------|------|
| 编译 60s 后超时（`504 Gateway Timeout`） | LLM 响应慢或 Markdown 过于复杂 | 提高 `vercel.json` 中 compile 的 `maxDuration`（最大 300s） |
| Settings 页 API Key 为空 | 环境变量未配置或未重新部署 | 在 Vercel Dashboard 确认环境变量，然后 Redeploy |
| `fetch failed` 调用 LLM | 供应商 API 不可达或 Key 无效 | 检查 `/api/ping` 响应；确认 Key 有效且未过期 |
| 编译返回 `error: llm_unavailable` | 供应商服务降级 | 切换到备用供应商（Settings 页） |

### SSE 流式问题

| 症状 | 原因 | 解决 |
|------|------|------|
| 编译页面一直转圈，无进度事件 | 响应被缓冲（未流式传输） | 确认 compile route 返回的 Response headers 包含 `Content-Type: text/event-stream` |
| 编译中途断开 | 函数超时被 kill | 检查 `maxDuration` 是否足够；Hobby 计划上限 300s |
| 客户端收到全部事件但不增量显示 | Next.js 缓存了路由 | 确认 compile route 未被静态优化（已是 POST + Dynamic，无需额外配置） |

## 成本与计划对比

| 特性 | Hobby（免费） | Pro（$20/月） |
|------|--------------|---------------|
| 函数最大超时 | 300s | 800s（1800s Extended Beta） |
| 带宽 | 100 GB/月 | 1 TB/月 |
| 函数调用 | 100 GB-Hours/月 | 1,000 GB-Hours/月 |
| 并发构建 | 1 | 并行 |
| 自定义域名 | ✅ | ✅ |
| 分析仪表板 | 有限 | 完整 |

**结论**：个人使用和小规模内测，Hobby 免费计划完全够用。如果编译频繁超时或需要更高并发，再考虑升级 Pro。

## 持续部署

本项目已配置 Git 集成：

| 操作 | 触发 |
|------|------|
| `git push origin main` | 生产部署（Production） |
| Pull Request 创建/更新 | 预览部署（Preview），获得临时 URL |
| Vercel Dashboard → Redeploy | 重新部署指定 commit（不改变代码） |

### 分支策略建议

```
main          ← 稳定生产代码
├── develop   ← 开发集成（可选）
├── feature/* ← 功能分支，通过 PR 合并
└── hotfix/*  ← 紧急修复，直接合并 main
```

每个 PR 会自动获得一个预览部署 URL（如 `alc-git-feature-xxx.vercel.app`），方便在合并前验证功能。

## 环境变量速查

```bash
# .env.local（本地开发，已在 .gitignore 中）
DEFAULT_LLM_PROVIDER=sensenova
DEFAULT_LLM_MODEL=deepseek-v4-flash
SENSENOVA_API_KEY=your_key_here
# DEEPSEEK_API_KEY=optional
# GLM_API_KEY=optional

# Vercel Dashboard → Settings → Environment Variables
# 配置与上面相同，但通过 Web 界面输入
```

或使用 Vercel CLI：

```bash
npm i -g vercel
vercel login
vercel link          # 关联本地项目到 Vercel
vercel env add SENSENOVA_API_KEY
vercel env add DEFAULT_LLM_PROVIDER
vercel env add DEFAULT_LLM_MODEL
```
