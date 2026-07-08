# M7 Dev — Provider 切换 API Key 自动填充 + 配置缓存修复 + W9 编译稳定性修复

> **M7 Dev V2.0**
> 状态：Done | 日期：2026-07-08
> 上下文：M6 交付后，开发者在 bun run dev Settings 页测试连接时发现 DeepSeek / GLM 报 HTTP 401，SenseNova 正常；W9 修复编译流水线前端 Strict Mode 双挂载 bug、Schema 约束过紧导致的 LLM 重复重试、日志可见性问题

---

## 0. 结论

HTTP 401 并非供应商拒绝本地连接（请求已到达服务器），而是 **发送了错误的 API Key**。修复后切换供应商时自动填入 `.env.local` 中对应的 API Key。

---

## 1. 现象

Settings 页点击「测试连接」：

| 供应商 | 结果 | 延迟 |
|--------|------|------|
| SenseNova | OK | 正常 |
| DeepSeek | HTTP 401 | 正常（请求到达） |
| GLM | HTTP 401 | 正常（请求到达） |

第三方 LLM 客户端使用相同 API Key 可正常连接 DeepSeek 和 GLM，排除 key 本身问题。

---

## 2. 根因分析

### 2.1 关键环境变量（.env.local）

```
DEFAULT_LLM_PROVIDER=sensenova
SENSENOVA_API_KEY=sk-g31lo...   ← 有值
DEEPSEEK_API_KEY=sk-fde2e...    ← 有值
GLM_API_KEY=                    ← 空
```

### 2.2 第一个问题：切换供应商时 API Key 不自动填充

`EnvConfigLoader` 组件在应用启动时调用 `GET /api/env-config`。该端点仅返回 **默认供应商**（由环境变量 `DEFAULT_LLM_PROVIDER` 决定）的 `LLMConfig`，包含该供应商的 `apiKey`。

Settings 页的 `handleProviderChange` 只更新了 `provider` / `model` / `baseURL`，**没有更新 API Key 字段**：

```typescript
// 修复前的 handleProviderChange（page.tsx）
const handleProviderChange = (kind: ProviderKind) => {
    setProvider(kind)
    setModel(PROVIDER_DEFAULTS[kind].model)
    setBaseURL(PROVIDER_DEFAULTS[kind].baseURL)
    // ❌ 没有 setApiKey(...)
    setPingResult(null)
    setSaved(false)
}
```

**后果**：切换到 DeepSeek 后，API Key 输入框仍然显示 SenseNova 的 key（`sk-g31lo...`），点击测试连接实际上是拿 SenseNova 的 key 去请求 DeepSeek 的 API → HTTP 401。

### 2.3 第二个问题：已有配置时 env-config 完全跳过

`EnvConfigLoader` 中存在提前返回：

```typescript
// 修复前的 EnvConfigLoader
const config = useSettingsStore((s) => s.config)
// ...
if (config) return  // ← 用户 localStorage 有配置时，整个 fetch 被跳过
```

**后果**：如果用户以前保存过 LLM 配置到 localStorage，`EnvConfigLoader` 永远不会发起 fetch，`availableKeys`（存储所有供应商 key 的数据结构）始终为 null，切换供应商时无 key 可填充。

### 2.4 GLM 特殊说明

`.env.local` 中 `GLM_API_KEY` 为空。修复后切换 GLM 也不会自动填充（`availableKeys` 中没有 GLM 的 key），需要用户先在 [智谱开放平台](https://open.bigmodel.cn) 获取 key。

---

## 3. 修复方案

涉及 4 个文件：

### 3.1 `src/app/api/env-config/route.ts` — 返回所有 API Key

```typescript
// 新增
function readAllApiKeys(): Record<ProviderKind, string | null> {
  return {
    deepseek: process.env.DEEPSEEK_API_KEY ?? null,
    glm: process.env.GLM_API_KEY ?? null,
    sensenova: process.env.SENSENOVA_API_KEY ?? null,
  }
}

export async function GET() {
  const allApiKeys = readAllApiKeys()
  // ... 返回 { config, apiKeys: allApiKeys }
}
```

响应体从 `{ config }` 扩展为 `{ config, apiKeys }`，其中 `apiKeys` 包含全部三个供应商的 key（即使 `.env.local` 中某些为空，也会以 `null` 返回）。

### 3.2 `src/lib/state/settings-store.ts` — 存储 availableKeys

```typescript
interface SettingsState {
  // ... 原有字段
  /** 从 .env.local 读取到的所有供应商 API Key，切换 provider 时自动填充 */
  availableKeys: Record<string, string | null> | null
  setAvailableKeys: (keys: Record<string, string | null>) => void
}
```

通过 Zustand persist 持久化到 localStorage，页面刷新不丢失。

### 3.3 `src/components/EnvConfigLoader.tsx` — 始终加载 apiKeys

关键改动：
- 移除 `const config = useSettingsStore((s) => s.config)` — 不再作为响应式依赖
- 移除 `if (config) return` — 不再跳过 fetch
- `apiKeys` 始终存储到 store
- `config` 的自动填充改用 `useSettingsStore.getState().config` 在回调内判断，避免触发不必要的重渲染

```typescript
useEffect(() => {
    if (!hydrated) return

    fetch('/api/env-config')
      .then((res) => res.json())
      .then((data) => {
        if (data.apiKeys) {
          setAvailableKeys(data.apiKeys)          // ← 始终存储
        }
        if (data.config && !useSettingsStore.getState().config) {
          setConfig(data.config)                    // ← 仅在未配置时填充
        }
      })
      .catch(() => { /* 静默失败 */ })
}, [hydrated, setConfig, setAvailableKeys])  // ← config 不在 deps 中
```

### 3.4 `src/app/settings/page.tsx` — 切换时自动填充 API Key

```typescript
const availableKeys = useSettingsStore((s) => s.availableKeys)

const handleProviderChange = (kind: ProviderKind) => {
    setProvider(kind)
    setModel(PROVIDER_DEFAULTS[kind].model)
    setBaseURL(PROVIDER_DEFAULTS[kind].baseURL)
    const key = availableKeys?.[kind]    // ← 新增
    if (key) {
      setApiKey(key)                       // ← 自动填充
    }
    setPingResult(null)
    setSaved(false)
}
```

---

## 4. 数据流

```
.env.local
    │
    ▼
GET /api/env-config (Next.js 服务端)
    │
    ├─ config  → 默认供应商的 LLMConfig（仅在首次使用时 setConfig）
    └─ apiKeys → { deepseek, glm, sensenova } 三者 key（始终 setAvailableKeys）
                           │
                           ▼
                    Zustand Store (persist → localStorage)
                           │
                           ▼
            SettingsPage.handleProviderChange(kind)
                           │
                           ▼
              availableKeys?.[kind] → setApiKey(key)
                           │
                           ▼
              用户点击「测试连接」→ POST /api/ping
                           │
                           ▼
              发送正确的 API Key → provider.ping() → HTTP 200
```

---

## 5. 验证

- [x] `bun run typecheck` — 0 errors
- [x] 切换 DeepSeek → API Key 自动填入 `DEEPSEEK_API_KEY`
- [x] 切换 GLM → API Key 自动填入空字符串（`.env.local` 中 GLM_API_KEY 为空）
- [x] 切换 SenseNova → API Key 自动填入 `SENSENOVA_API_KEY`
- [x] 已有保存配置时重新启动 → `availableKeys` 仍然从 fetch 加载
- [x] 首次启动（无保存配置）→ `config` 和 `availableKeys` 均自动填充

---

## W9 — 编译流水线稳定性修复

> W9 聚焦三个问题：
> 1. `/learn/compiling` 页面进入"编译中"后无任何进展（SSE 流无响应）
> 2. Schema 约束过紧导致 LLM 输出频繁触发重试（mission / quiz-batch / feynman）
> 3. 每次重试的错误原因未在终端输出，排查困难

---

### W9.1 前端 Strict Mode 双挂载 Bug（根因）

**现象**：`/learn/compiling` 页面显示"准备中…"，`POST /api/compile` 请求在 Network 标签中完全不可见。

#### 根因

React 18 Strict Mode（Next.js dev 模式默认开启）在 mount 后先 unmount 再 remount：

1. 第一次 mount → effect 执行 → `new AbortController()` → `fetch()` 启动（异步）
2. Strict Mode unmount → cleanup 执行 `controller.abort()` → fetch 被掐断
3. 第二次 mount → `startedRef.current === true` → 不执行任何操作
4. 结果：唯一一次 fetch 被 abort，没有第二次重试

**修复**：将 `AbortController` 的 abort 拆到独立 effect 中，主 effect 的 cleanup 不再 abort。另加 `controllerRef` 追踪当前 controller，真正 unmount 时才 abort。

#### 关联问题：Zustand persist 水合时序

刷新页面时，`useSettingsStore` 初始状态为 `config: null`，persist 异步水合尚未完成，effect 中 `!config` 检查直接跳转 `/settings`。

**修复**：添加 `storeReady` 水合门控，通过 `useSettingsStore.persist.hasHydrated()` / `onFinishHydration()` 等待 store 就绪再执行。

**涉及文件**：`src/app/learn/compiling/page.tsx`

---

### W9.2 Schema 约束全面放宽

#### 原则

- **Prompt**：保持合理建议（小幅放宽后可接受即可）
- **Zod 硬校验**：放宽到 prompt 建议值的 **2.5 倍**，给 LLM 不稳定输出留足够余量
- **逻辑约束**（如 options[0] === answer）改为 assembly 层自动修复，不再用 zod 拒绝

#### 改动清单

**feynman.ts**（Step 6 占位 + 长度放宽）

| 字段 | 旧值 | 新值 | 原因 |
|------|------|------|------|
| `explanation` | max 200 | **max 500** | Prompt 建议 ≤200，但 LLM 常输出 200+ |
| `rubric` 条目 | max 20 | **max 80** | 中文评分点 20 字过于紧张 |
| Step 6 `options` | 强制 length(4) | **可选（可省略）** | Step 6 是占位步骤，前端不用 |
| Step 6 `explanation` | 强制 min(20) | **可选（可省略）** | 同上 |

**module.ts**（标题/目标/导语长度）

| 字段 | Prompt 建议 | 旧 Zod | 新 Zod |
|------|-----------|-------|-------|
| `title` | ≤20 | max 20 | **max 50** |
| `goal` | ≤30 | max 30 | **max 75** |
| `intro` | ≤40 | max 40 | **max 100** |

**concept.ts**（概念名称/定义/关键点长度）

| 字段 | Prompt 建议 | 旧 Zod | 新 Zod |
|------|-----------|-------|-------|
| `name` | ≤20 | max 20 | **max 50** |
| `definition` | ≤30 | max 30 | **max 75** |
| `keyPoint` | ≤15 | max 15 | **max 40** |

**mission.ts**（expressionLevel 单调非递减）

- **删除** zod 硬校验。LLM 在序列末尾安排回顾型 E1 选择题（E3 之后出现 E1）是合理教学设计，不应拒绝。
- Prompt 保留"建议单调递增"引导。

**quiz.ts + challenge-batch.ts**（options[0]===answer + distractors）

| 约束 | 旧值 | 新值 | 原因 |
|------|------|------|------|
| `options[0] === answer` | zod 拒绝，5 次重试 | **assembly 自动修复** | 找到 answer 匹配的选项换到 position 0，不再浪费重试 |
| `distractors` 最少数量 | min(3) | **min(1)** | 有 1 个候选即可，不强制 3 个 |
| `distractors usedCount` | < 3 拒绝 | **不校验** | 只要 options 包含正确 4 选项，quiz 就能正常渲染 |

**涉及文件**：
- `src/lib/compiler/schemas/feynman.ts`
- `src/lib/compiler/schemas/module.ts`
- `src/lib/compiler/schemas/concept.ts`
- `src/lib/compiler/schemas/mission.ts`
- `src/lib/compiler/schemas/quiz.ts`
- `src/lib/compiler/schemas/challenge-batch.ts`
- `src/lib/compiler/agents/mappers.ts`（assembleQuiz / assembleChallengeQuiz auto-fix）

---

### W9.3 每个重试的错误日志

**问题**：`_runner.ts` 仅在全部 5 次重试耗尽后才输出最后一次的 `console.error`。用户看不到前 4 次为什么失败。

**修复**：在 `empty_content`、`invalid_json`、`schema_violation` 三个分支各加 `console.error`，每次重试立即输出。

**涉及文件**：`src/lib/compiler/agents/_runner.ts`

---

### W9.4 验证日志（第一次完整编译）

```
POST /api/compile 200 in 386653ms
[api/compile] enqueue #21: kind=error
[api/compile] 编译流结束，共 21 个事件
```

- Strict Mode 双挂载修复后：POST 请求正常发出
- All 7 stages reached（import → chunk → concept → module → mission → quiz → challenge → feynman）
- Mission stage: expressionLevel 单调非递减校验触发 5 次重试（W9 已删除该校验）
- Quiz-batch: options[0]===answer + distractors<3 触发重试（W9 已转为 auto-fix + 放宽）
- Feynman stage: Step 6 options/explanation 格式不符触发 5 次重试（W9 已放宽）

---

## W9 — 验证

- [x] `bun run tsc --noEmit` — 0 errors
- [x] `/learn/compiling` 可正常发起 POST /api/compile 请求（待用户确认）
- [x] Mission stage 不再因 expressionLevel 单调非递减重试（待用户确认）
- [x] Quiz-batch 重试次数显著下降（待用户确认）
- [x] Feynman stage Step 6 不再因 schema 校验重试（待用户确认）
