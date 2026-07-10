# 展示题库添加指南

> **适用版本：** M8+（Showcase Mode）
> **最后更新：** 2026-07-10

本文档说明如何为展示模式（Showcase Mode）编译、导出、添加预编译题库。

---

## 前置条件

- 本地 `.env.local` 已配置至少一个 LLM 供应商的 API Key（推荐 DeepSeek）
- 应用以**实用模式**运行（`NEXT_PUBLIC_APP_MODE` 未设或为 `production`）

---

## 1. 编译 Markdown

### 1.1 通过 UI（推荐）

1. 启动开发服务器：`bun run dev`
2. 访问 **`/studio`**（实用首页）或 **`/`**（实用模式下与 `/studio` 一致）
3. 点击「开始学习」→ 进入 `/learn/import`
4. 粘贴优质 Markdown 内容（≥ 200 字符）
5. 点击「开始编译」→ 等待 8 阶段编译完成
6. 完整走一遍学习流程（答题 + 费曼），确认内容质量

### 1.2 内容质量要求

展示题库代表产品门面，编译前请确认：

- **Markdown 原文**：结构清晰、主题明确、信息密度高
- **概念提取**：3-5 个概念，名称准确、定义无歧义
- **练习题**：题型多样（选择 / 排序 / 填空），题目无错漏
- **费曼任务**：步骤完整、引导语自然
- **综合挑战题**：覆盖核心概念，难度适中

> 推荐主题：通用学习方法（费曼学习法）、经典技术入门（React Hooks）、科普知识等。避免过于垂直或时效性内容。

---

## 2. 导出 .alc-module.json

编译完成并验证质量后：

1. 进入 **`/learn/library`**（题库页）
2. 找到目标 Module，点击该行的 **「导出」** 按钮
3. 浏览器自动下载 `<module-title>.alc-module.json` 文件
4. 将文件重命名为有意义的 kebab-case 名称，如 `feynman-learning.alc-module.json`

### 导出文件结构

`.alc-module.json` 是 `CompiledModulePackage` 格式，包含：

```json
{
  "version": 1,
  "exportedBy": "ai-learning-compiler",
  "exportedAt": 1720000000000,
  "source": {
    "id": "source-xxx",
    "type": "markdown",
    "content": "原始 Markdown 全文",
    "createdAt": 1720000000000
  },
  "module": {
    "id": "module-xxx",
    "sourceId": "source-xxx",
    "title": "...",
    "intro": "...",
    "goal": "...",
    "concepts": [...],
    "feynmanTask": {...},
    "challengeQuizzes": [...]
  }
}
```

### 安全检查

导出文件**不含** `apiKey` 字段。`parseModulePackage()` 在加载时会执行 6 步校验，其中包括 `"apiKey"` 字符串检测 —— 如果文件中包含此字段，加载会被拒绝。

---

## 3. 放置文件

将导出的 `.alc-module.json` 文件放入静态资源目录：

```
public/showcase-modules/
├── manifest.json                          ← 清单（需手动编辑）
├── intro-to-alc.alc-module.json          ← 示例题库
└── feynman-learning.alc-module.json      ← 你新增的题库
```

---

## 4. 注册到 manifest.json

编辑 `public/showcase-modules/manifest.json`，在 `modules` 数组中新增条目：

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
    },
    {
      "id": "feynman-learning",
      "package": "feynman-learning.alc-module.json",
      "title": "费曼学习法入门",
      "description": "通过输出倒逼输入，用最简单的语言讲清楚最复杂的知识",
      "featured": false,
      "order": 2
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 展示题库的逻辑标识（独立于 Module 自身的 `moduleId`）。用于 manifest 索引，不可重复 |
| `package` | string | `public/showcase-modules/` 下的文件名。必须以 `.alc-module.json` 结尾 |
| `title` | string | 展示首页卡片标题。建议与 Module 自身 title 一致，也可单独定制 |
| `description` | string | 展示首页卡片描述。一句话说明题库内容 |
| `featured` | boolean | `true` = 模拟编译默认进入此题库。**有且仅有一个** `featured: true` |
| `order` | number | 展示首页卡片排序。数字小的排前面 |

---

## 5. 验证

### 本地验证（展示模式）

```bash
NEXT_PUBLIC_APP_MODE=showcase bun run dev
```

访问 `http://localhost:3000`：

1. 展示首页应显示新增的题库卡片
2. 点击卡片「开始学习」→ 跳转到学习页 → 正常答题
3. 点击「模拟编译」→ 8 阶段动画 → 跳转到 featured 题库
4. 访问 `/settings` → 展示 Settings 信息页应列出新增题库

### Vercel 验证

1. 将文件提交到 Git → 推送 → Vercel 自动部署
2. 访问 Vercel URL，重复上述验证步骤
3. 确认 Network 面板中 `showcase-modules/*.alc-module.json` 请求返回 200

---

## 6. 更新已有题库

如需更新已有题库的内容：

1. 在 `/studio` 中用相同 Markdown 重新编译（LLM 输出可能不同）
2. 导出新的 `.alc-module.json`
3. 用新文件覆盖 `public/showcase-modules/` 中的旧文件
4. 重新部署

> **注意：** 更新后，已加载旧版本到 LocalStorage 的用户不受影响（本地副本独立）。新访问的用户会加载新版本。

---

## 7. 常见问题

### Q: 题库文件太大怎么办？

单题库 JSON 建议 < 100KB。如果文件过大：
- 减少 Markdown 原文长度（`source.content` 占主要体积）
- 确认编译产出的概念数合理（3-5 个，过多会增大 quiz 数量）

### Q: 可以手写 .alc-module.json 吗？

**不推荐。** 展示题库必须由编译产出。`parseModulePackage()` 的 6 步校验会拒绝不合规的 JSON。手写 JSON 容易遗漏 `exportedBy`、`version` 等必需字段。

### Q: 多个题库可以指向同一个 .alc-module.json 吗？

可以，但不推荐。每个 manifest 条目应有独立的 package 文件，避免歧义。

### Q: featured 题库可以有多个吗？

不建议。代码中 `findFeaturedModule()` 取第一个 `featured: true` 的条目。如有多个，仅第一个生效。
