# AI Learning Compiler

AI Learning Compiler（项目内部名：`ai-learning-compiler`）是一款中文优先的个人学习工具：把 Markdown 原文编译成可交互的学习 Module，再通过概念讲解、阶梯式练习和费曼讲解完成学习闭环。

当前版本：`v2.1.0`

## 核心能力

- Markdown → 概念、知识页、选择题/排序题/填空题、综合挑战和费曼任务。
- Showcase 模式：无需数据库即可体验预置题库、模拟编译和完整学习流程。
- Production 模式：本地 SQLite 持久化个人题库、进度、作答记录和设置。
- AI 扩充：在编译前为概念生成知识页，并按 anchor ID 回填；支持单 Module 和多 Module/Topic 批量扩充。
- 批量任务：按 Module checkpoint 执行，支持暂停、恢复、取消、失败项重试和 source hash 校验。
- FSRS 间隔复习：Today 今日复习、错题/蒙题复习、学习 streak 和 7/30 日统计趋势。
- 题库与 Topic 管理：导入、导出、分组、忽略题目、编辑答案和恢复学习进度。
- 客户端搜索：`Cmd/Ctrl + K` 搜索 Module、概念、知识页和题目。

## 两种运行模式

| 模式               | 适用场景                     | 数据存储                | 编译方式                                         |
| ------------------ | ---------------------------- | ----------------------- | ------------------------------------------------ |
| `showcase`（默认） | 在线演示、产品体验、静态展示 | 浏览器 LocalStorage     | 预置题库 + 模拟编译；配置 LLM 后也可使用真实编译 |
| `production`       | 个人 localhost 使用          | SQLite + 客户端写入队列 | 真实 LLM 编译，包含备份、迁移和 FSRS             |

两种模式是同一套代码的 build-time 分支。不要把 production 服务直接暴露到公网；当前版本没有账号、认证和多设备同步能力。

## 快速开始

### 1. 安装依赖

环境要求：Bun 1.1+、Node.js 20+。

```bash
bun install
```

### 2. 体验 Showcase 模式

```bash
NEXT_PUBLIC_APP_MODE=showcase bun run dev
```

打开 <http://127.0.0.1:3000>。预置题库和模拟编译不需要 API Key；如果要使用真实 LLM 编译、答题反馈或费曼评估，请继续配置 `.env.local`。

### 3. 启动 Production 模式

复制环境变量示例并填写至少一个 LLM provider 的 API Key：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，例如：

```dotenv
DEFAULT_LLM_PROVIDER=deepseek
DEFAULT_LLM_MODEL=deepseek-v4-flash
DEEPSEEK_API_KEY=sk-替换为真实密钥
```

然后显式打开 SQLite，并只监听本机：

```bash
NEXT_PUBLIC_APP_MODE=production ALC_STORAGE_BACKEND=sqlite bun run dev -- --hostname 127.0.0.1
```

生产构建/启动：

```bash
NEXT_PUBLIC_APP_MODE=production ALC_STORAGE_BACKEND=sqlite bun run build
NEXT_PUBLIC_APP_MODE=production ALC_STORAGE_BACKEND=sqlite bun run start -- --hostname 127.0.0.1
```

首次访问需要数据库的 API 后，应用会创建 `data/alc.db`；自动一致性快照保存在 `data/backup/`。不要提交 `.env.local`、数据库或备份文件。

## LLM provider

支持以下 provider：

- `deepseek`
- `glm`
- `openai-compat`（需要自定义 `OPENAI_COMPAT_BASE_URL`）

完整变量和默认模型见 [`.env.example`](./.env.example)。脚本需要显式加载环境变量时使用：

```bash
bun --env-file=.env.local run scripts/ping.ts
```

## 常用入口

| 页面                      | 用途                                     |
| ------------------------- | ---------------------------------------- |
| `/`                       | 根据运行模式显示首页                     |
| `/learn/import`           | 导入 Markdown，开始单 Module 或批量扩充  |
| `/learn/library`          | 管理 Module、Topic、导入导出和忽略题目   |
| `/learn/today`            | 查看今日 due 复习和 streak               |
| `/learn/stats`            | 查看学习统计、7/30 日趋势和首答/复习数据 |
| `/learn/review/:moduleId` | 复习单个 Module 的错题和蒙题             |
| `/settings`               | LLM、FSRS、存储、迁移和备份验证设置      |
| `/studio`                 | Showcase 模式的展示入口                  |

## 开发命令

```bash
bun run dev
bun run typecheck
bun run lint
bun run test
bun run e2e
bun run build
bun run format:check
```

双模式构建：

```bash
NEXT_PUBLIC_APP_MODE=showcase bun run build
NEXT_PUBLIC_APP_MODE=production ALC_STORAGE_BACKEND=sqlite bun run build
```

其他工具：

```bash
bun run db:status
bun run db:backup
bun run scripts/search-benchmark.ts
bun run og:render
```

`search-benchmark.ts` 使用合成数据测量搜索索引性能，不读取本地题库或 provider 配置。

## 项目结构

```text
src/app/                 Next.js App Router 页面与 API
src/components/          页面、学习流程、题目、搜索和设置组件
src/lib/compiler/        LLM 编译 pipeline、agents、schema 和 prompts
src/lib/providers/       DeepSeek、GLM、OpenAI-compatible provider
src/lib/runtime/         评估、FSRS、统计、搜索等纯业务逻辑
src/lib/persistence/     LocalStorage/SQLite 存储与迁移、备份
src/lib/state/           Zustand stores
src/types/               领域模型
public/showcase-modules/ Showcase 预置题库
docs/                    版本化 PRD、设计、部署和 Review
e2e/                     Playwright 端到端测试
```

编译器子系统约定见 [`src/lib/compiler/AGENTS.md`](./src/lib/compiler/AGENTS.md)，面向维护者的项目知识库见 [`AGENTS.md`](./AGENTS.md)。

## 数据与安全注意事项

- Production 是个人 localhost 方案，不是公网部署方案。
- 启动 production 时必须使用 `--hostname 127.0.0.1`，不要绑定 `0.0.0.0`，也不要使用隧道或端口转发。
- 不要直接复制正在写入的 SQLite 主文件；使用应用自动快照或 `bun run db:backup`。
- 不要把 API Key 写入导出题库、日志、截图或 issue。导出包会拒绝包含 `apiKey` 字段的内容。
- LocalStorage → SQLite 迁移是单向流程；迁移前应确认已有备份。

## 文档导航

- [本地 Production 部署指南](./docs/v2.0.0/Deploying-Localhost.md)
- [V2.1.0 实施计划](./docs/v2.1.0/v2.1.0-plan.md)
- [V2.1.0 Review 与验证结果](./docs/v2.1.0/v2.1.0-Review.md)
- [Showcase 题库添加指南](./docs/v1.0.0/Showcase-Guide.md)
- [产品需求文档](./docs/v1.0.0/PRD.md)
