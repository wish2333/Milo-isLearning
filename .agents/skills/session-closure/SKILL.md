---
name: session-closure
description: >
  Close out a milestone or implementation session by: (1) writing a Review.md doc matching the project's existing review style, (2) staging all changed/untracked files, (3) committing with a detailed M1-M2.5-style message body (grouped bullet points under area headers), (4) creating a git tag matching existing conventions, (5) pushing branch + tags to remote.
  Use when a user asks to "close out", "wrap up", "finish a milestone", "create a review doc and commit", or at the end of any significant implementation phase where deliverables need to be documented and versioned.
---

# Session Closure Workflow

## Step 1: Set the version label

Determine the milestone/session label from context (e.g., `M7.8`, `Sprint-12`). This label drives the file name, commit title, and tag name.

## Step 2: Write the Review document

Locate the most recent Review.md in the project (`git log --oneline --all | head -5` to find recent commits, then check `docs/` for existing review docs). Study its structure — sections, heading style, tone, table format. Then:

- Create `<docs-path>/<label>-Review.md`
- Match the existing review doc's section structure, tone, and level of detail
- Cover: 0-Conclusion, 1-Deliverables, 2-Architecture decisions, 3-Verification results, 4-Known limitations, 5-Migration notes
- Include exact verification command outputs (`bun run typecheck`, `bun run test`, etc.)

## Step 3: Stage ALL changed files

```bash
git add -A
```

This captures modified (M), deleted (D), and untracked (??) files. Do NOT use per-file staging — the user expects full coverage.

## Step 4: Commit with M1-M2.5-style message

M1-M2.5 style means: **one-line title + detailed body with grouped bullet points**.

```bash
git commit -m 'feat: 完成 <label> 阶段交付（<key_area_1> + <key_area_2> + ...）

对齐 <reference_doc> 的 <scope_description>。

<Area Header 1>:

  - <file/path>：<specific change description>
  - <file/path>：<specific change description>

<Area Header 2>:

  - <file/path>：<specific change description>
  - <file/path>：<specific change description>

文档:

  - <new docs created>

验证:

  - 静态验证：tsc --noEmit 零错误 / eslint 零错误零警告
  - 单元测试：vitest <N>/<N> 通过（<M> files）

验收详见 <review doc path>；版本基线 tag = <tag-name>。'
```

Format rules:

- Title: `feat: 完成 <Label> 阶段交付（括号内 2-4 个关键词，+ 分隔）`
- Area headers: Chinese, colon-terminated, bold-free
- File paths: relative, no backticks
- Each bullet: `path：具体改动`（中文冒号，无空格）
- Blank line between area groups

## Step 5: Create and push tag

```bash
git tag <tag-name>
git push origin main --force
git push origin <tag-name> --force
```

Tag name must match existing conventions. Check with `git tag --sort=-v:refname | head -10`.

Use `--force` on both pushes to handle amended commits safely.

## M1-M2.5 commit body examples

```
对齐 PRD §14 与 Technical-Specification §16（严格基准）的全部 8 项交付物。

文档（docs/）:

  - Product-Specification.md / PRD.md V1.0：设计宪法与功能需求
  - Technical-Specification.md V1.0：技术架构（17 章 1268 行，7 项关键决策）
  - ui-design/DESIGN-SPEC.md V1.1：UI 设计说明书

数据模型与 Provider（src/）:

  - types/domain.ts：PRD §8 全部接口 + 运行时扩展（ModuleStage discriminated union）
  - lib/providers/：DeepSeek + GLM 双 Provider（OpenAI 兼容协议 + 重试策略 + SSE）
```
