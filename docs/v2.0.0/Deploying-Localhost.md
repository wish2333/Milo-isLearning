# 本地 localhost 部署指南

> 适用版本：v2.0.0 production 模式
>
> 本指南用于个人自托管。production 模式包含本地 SQLite 数据库，必须只绑定到本机，不能直接暴露到公网。

## 环境要求

| 组件 | 要求 |
| --- | --- |
| macOS / Linux / Windows | 支持 Bun 和 Node.js 的系统 |
| Bun | 1.1 或更新版本（项目开发、安装依赖和启动命令使用 Bun） |
| Node.js | 20.x 或更新版本（Next.js 15、better-sqlite3 的运行时要求） |
| LLM 供应商 | 至少一个可用的 DeepSeek、GLM 或 OpenAI 兼容 API Key |

检查版本：

```bash
bun --version
node --version
```

首次使用时，在项目目录安装依赖：

```bash
bun install
```

## 配置 LLM

`.env.local` 只放 LLM 配置和密钥，不要把数据库开关、备份路径或真实密钥提交到 Git。示例：

```dotenv
DEFAULT_LLM_PROVIDER=deepseek
DEFAULT_LLM_MODEL=deepseek-v4-flash
DEEPSEEK_API_KEY=sk-替换为真实密钥

# 可选：使用 GLM 或 OpenAI 兼容服务时填写对应配置
# GLM_API_KEY=
# OPENAI_COMPAT_API_KEY=
# OPENAI_COMPAT_BASE_URL=https://example.com/v1
```

`.env.local` 已被 Git 忽略。不要在文档、日志、截图或 issue 中粘贴 API Key。

## 启动 production 模式

production 必须同时打开两个开关：`NEXT_PUBLIC_APP_MODE=production` 和 `ALC_STORAGE_BACKEND=sqlite`。建议在命令行显式设置，避免其它环境变量让本地误进入 showcase 或半配置状态。

先构建，再以仅 localhost 监听的方式启动：

```bash
NEXT_PUBLIC_APP_MODE=production ALC_STORAGE_BACKEND=sqlite bun run build
NEXT_PUBLIC_APP_MODE=production ALC_STORAGE_BACKEND=sqlite bun run start -- --hostname 127.0.0.1
```

开发调试可使用：

```bash
NEXT_PUBLIC_APP_MODE=production ALC_STORAGE_BACKEND=sqlite bun run dev -- --hostname 127.0.0.1
```

打开 <http://127.0.0.1:3000>，进入 Settings 配置或确认 LLM。若 API 返回“数据库未启用”，请检查两个 production 开关是否同时设置。

## SQLite 与备份文件

production 模式第一次访问需要数据库的 API 时，会创建：

```text
data/alc.db
```

自动一致性快照位于：

```text
data/backup/alc-snapshot-YYYYMMDD-HHmmss.db
```

说明：

- `data/alc.db` 是当前学习数据，包含 SQLite WAL 相关文件时不要只复制主文件；使用应用触发的自动快照进行备份。
- 模块完成后会先 flush 客户端写入，再触发强制快照；普通答题写入按 24 小时阈值触发快照。
- 自动快照最多保留最近 10 份。需要确认最近快照可用时，在 production Settings 点击“验证最近备份”；系统会执行 `PRAGMA integrity_check`。
- `data/` 含个人学习数据，应加入本机备份策略并限制文件权限，不要上传到公共仓库。

## localhost 安全边界

这是个人本地服务，不是公网部署方案：

- 启动命令必须使用 `--hostname 127.0.0.1`，不要绑定 `0.0.0.0` 或局域网地址。
- 不要配置端口转发、反向代理公网入口、ngrok / Cloudflare Tunnel 等隧道。
- 不要把 `data/alc.db`、`data/backup/` 或 `.env.local` 放到静态资源目录，也不要通过文件共享服务公开。
- 如需让另一台设备访问，请先增加认证、传输加密和访问控制；本版本不提供这些能力，因此不支持直接开放访问。

停止服务可在运行终端按 `Ctrl+C`。升级代码前先停止服务并保留一份最新自动快照。
