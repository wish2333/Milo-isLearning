# v1.0.0 Release — 持久化升级 + Production 模式上线

> 本 PR 把 `feat/v1.0.0-mvp-polish` 分支（V1.0.0 MVP Final Polish + v1.0.0 持久化升级 + 生产 bug 修复）合并到 `main`，作为 v1.0.0 正式发布基线。版本号 `0.1.0` → `1.0.0`，tag `v1.0.0` 已打。

## 范围

| 阶段                    | 主题                                             | Commits                                           |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------- |
| V1.0.0 MVP Final Polish | LLM fallback + SEO + 蒙对撤销 + 间隔重复开关     | `2aea1fc` `d350de9` `fbee37f` `c60512d` `9e0813a` |
| v1.0.0 Build            | SQLite 持久化 + 客户端写队列 + LS迁移 + 备份恢复 | `2504cb4`                                         |

## 主要交付

### 持久化层（P0-P5 六个 Phase）

- **三层目录**：`shared/`（接口）+ `client/`（cache + write-queue）+ `server/`（SQLite）
- **SQLite schema**：4 表（kv / meta / migration_session / migration_staging）+ WAL
- **客户端写队列**：FIFO + per-key 合并 + 3 档退避（250ms/1s/4s）+ FlushManager + zustand-storage-adapter
- **数据迁移**：7-phase LS→SQLite 编排器 + 5 个 `/api/migrate/*` 路由 + 4 个 UI 组件
- **BackupPackage**：V1 Zod schema + 长度前缀 SHA-256 checksum + VACUUM INTO 快照 + apiKey 字段级剔除

### 生产 bug 修复（关键）

| #   | Bug                                       | 文件                      | 影响                                                         |
| --- | ----------------------------------------- | ------------------------- | ------------------------------------------------------------ |
| 1   | `bun:sqlite` 在 Node 不可用               | `db-singleton.ts`         | production 模式 dev server 完全不可用（Cannot find module）  |
| 2   | chunkBySize 字符数当字节数                | `migration.ts`            | 中文富数据触发 `/api/migrate/staging` 413                    |
| 3   | Chrome keepalive 64 KiB 字节限制          | `client-fetch-storage.ts` | 中文 module state 写入触发 `Failed to fetch`                 |
| 4   | app-mode 默认与 server fail-closed 不一致 | `app-mode.ts`             | 未设环境变量时 client/server 模式判断错位，`/api/data/*` 404 |
| 5   | .env.example 残留 sensenova               | `.env.example`            | 误导用户配置已删除的 provider                                |

### UI 微调

- 首页（showcase + production 双模式）新增「进入题库」快捷入口

## 验证

```
$ bun run typecheck
0 errors

$ bun run lint
0 errors, 0 warnings

$ bun run test
Test Files  40 passed (40)
     Tests  448 passed (448)

$ bun run build
Compiled successfully in 3.4s
Generating static pages (30/30)
```

新增 11 个测试套件共 167 测试（详见 commit body）。

## 文档

- [`docs/v1.0.0/v1.0.0-build-plan.md`](docs/v1.0.0/v1.0.0-build-plan.md) — Rev B 实施计划（6 Phase）
- [`docs/v1.0.0/v1.0.0-build-review.md`](docs/v1.0.0/v1.0.0-build-review.md) — 本 milestone 完整 Review（6 章 + 附录）
- [`docs/v1.0.0/v1.0.0-build-persistence-upgrade-review.md`](docs/v1.0.0/v1.0.0-build-persistence-upgrade-review.md) — review 报告（H1-H3 + M1-M4 + L1-L4）
- [`docs/v1.0.0/v1.0.0-build-report.md`](docs/v1.0.0/v1.0.0-build-report.md) — subagent 派发记录
- `AGENTS.md` 已同步更新（STRUCTURE / CODE MAP / CONVENTIONS / ANTI-PATTERNS）

## 已知限制

详见 [`v1.0.0-build-review.md` §4](docs/v1.0.0/v1.0.0-build-review.md#4-已知限制)：

1. **E2E 未实跑**：29 个 e2e 测试已编写但需 `bunx playwright install chromium`
2. **Vercel serverless 未实测**：`better-sqlite3` 是 C++ addon，Lambda 加载需验证
3. **review 中 v1.0.1 项未处理**：M1 isSameOrigin 反代漏洞 / M4 progress 双写评估
4. **module ID 孤儿问题**：`alc:state:module.currentModuleId` 可能指向 SQLite 里不存在的 module（迁移残留）

## 下一里程碑候选（v1.0.1）

- Vercel 部署 smoke test
- E2E 实跑
- 反代场景 isSameOrigin 修复
- 全局扫 `.length <` / `.length >` 找剩余字符数当字节数用的地方

## 系统性教训

本会话暴露了一类 bug——JavaScript string `.length` 算字符数，但 HTTP / SQLite / Chrome 限制都按字节数。在中文富数据项目里所有字符数当字节数用的判断都要改 `TextEncoder`。已修复 3 处，详见 [v1.0.0-build-review.md 附录](docs/v1.0.0/v1.0.0-build-review.md#附本会话暴露的系统性问题)。

---

合并后请 tag `v1.0.0`（已打在 `feat/v1.0.0-mvp-polish` 分支 HEAD `2504cb4`）。
