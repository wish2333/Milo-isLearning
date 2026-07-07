# Git 工作流（Git Flow）入门

## 什么是 Git 工作流

Git 工作流（Git Workflow）是团队协作时约定的 Git 分支使用规范。它定义"什么类型的改动应该走哪条分支、何时合并、如何发布"等规则。Git 本身只是版本控制工具，工作流是叠加在工具之上的协作约定。

不同团队规模、不同发布节奏适合不同的工作流。常见流派有四种：Git Flow、GitHub Flow、GitLab Flow、Trunk-Based Development。它们在"分支数量"和"发布方式"上有显著差异。

## Git Flow（经典流派）

Vincent Driessen 在 2010 年提出的 Git Flow 是最早系统化的工作流。它有五类常驻分支：

**main**：生产代码所在分支，每次合并都打 tag 发布。

**develop**：日常集成分支，所有新功能最终都汇入这里。

**feature/\\\***：从 develop 切出，开发完合回 develop。一个 feature 一个分支。

**release/\\\***：从 develop 切出用于准备发布，只允许 bug fix，最终合回 develop 与 main。

**hotfix/\\\***：从 main 切出用于生产紧急修复，最终合回 develop 与 main。

Git Flow 的优点是结构严谨、生命周期清晰，适合有明确发布周期的产品（如桌面软件、移动 App）。缺点是分支太多、合并冲突频繁，对持续部署（Continuous Deployment）的 Web 产品来说太重。

## GitHub Flow（轻量流派）

GitHub Flow 把分支简化为两类：main + feature 分支。规则只有六条：

1. main 分支永远是可部署状态
2. 任何改动都从 main 切出 feature 分支
3. 在 feature 分支上提交
4. 开 Pull Request
5. 在 PR 上做 review 与 CI 验证
6. review 通过后合回 main，立即部署

GitHub Flow 适合"一天多次部署"的 Web 产品。它牺牲了 release/hotfix 分支的精细控制，换来了工作流的极致简单。GitHub、Netflix、大部分 SaaS 公司都用这个流派。

## Trunk-Based Development（主干开发）

Trunk-Based 把分支简化到极致：所有人都在 main（trunk）上直接提交，或切出极短生命周期的 feature 分支（< 24 小时）。它依赖**功能开关**（Feature Flags）来隔离未完成的功能——代码先合进 main，但被 flag 包裹，默认关闭。

Trunk-Based 的优势是集成问题被压缩到最小（每天甚至每小时集成），缺陷是要求团队有成熟的 CI/CD 与 feature flag 基础设施。Google、Meta 等大型工程组织都采用这个流派。

## 三种工作流的对比

| 维度 | Git Flow | GitHub Flow | Trunk-Based |
|------|---------|-------------|-------------|
| 分支数量 | 5 | 2 | 1-2 |
| 发布节奏 | 周/月级 | 日级 | 小时级 |
| 适用产品 | 桌面/移动 App | Web SaaS | 大型在线服务 |
| CI/CD 要求 | 低 | 中 | 高 |
| 学习曲线 | 陡 | 平 | 平但基础设施门槛高 |

选择工作流的关键问题是：你的产品能容忍多长的发布周期？周期越长越适合 Git Flow，周期越短越适合 Trunk-Based。

## Pull Request 与 Code Review

无论哪种工作流，Pull Request（PR）都是协作的核心环节。PR 不仅是"把代码合起来"的工具，更是知识共享与质量门禁的载体。

一个健康的 PR 应满足三个标准：

**小**：单次 PR 控制在 200-400 行 diff 内。超过这个量级 reviewer 容易疲劳，缺陷检出率断崖式下降。

**单一职责**：一个 PR 只解决一个问题。混合功能新增与重构会让 review 困难，也让回滚变得复杂。

**自我描述**：PR 描述里写清"为什么改、怎么改、如何测试"。reviewer 不应被强迫读 commit message 才能理解上下文。

Code Review 的核心不是挑错，而是**知识传递**。reviewer 在 review 过程中学习了别人的实现，author 也通过反馈获得改进建议。把 review 当成"找茬大会"会让团队 review 文化迅速劣化。

## 常见反模式

几种常见的 Git 工作流反模式：

**直接 push 到 main**：绕过 review 的 push 是协作灾难的起点。即使是热修复，也应该走 PR（哪怕快速 approve）。

**长期 feature 分支**：feature 分支活超过一周就会与 main 严重分叉，合并冲突变得噩梦。要么频繁 rebase，要么干脆用 Trunk-Based。

**巨大的 release 分支**：release 分支累积太多未合并变更，最终变成"小 main"，失去 release 的隔离意义。

**用 commit message 而非 PR 描述传递信息**：commit message 是历史记录，PR 描述才是当下的协作载体。reviewer 不会去翻 commit。
