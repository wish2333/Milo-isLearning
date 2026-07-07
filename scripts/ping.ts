/**
 * LLM Provider 真实 ping 脚本
 *
 * 用法：
 *   bun --env-file=.env.local run scripts/ping.ts
 *
 * 环境变量（从 .env.local 读取，bun 默认不自动加载，需 --env-file 显式指定）：
 *   DEEPSEEK_API_KEY   - 若设置，则 ping 原生 DeepSeek
 *   GLM_API_KEY        - 若设置，则 ping GLM（默认 Coding Plan 端点）
 *   SENSENOVA_API_KEY  - 若设置，则 ping SenseNova（默认测试通道，托管 deepseek-v4-flash）
 *
 * 未设置的供应商会被自动 skip。全部未设置时输出指引。
 *
 * 对应 docs/Technical-Specification.md §16 M1 验收：「Provider 接入并通过 ping 测试」。
 */

import { createProvider, isSupportedProvider } from '../src/lib/providers'
import type { LLMConfig, PingResult, ProviderKind } from '../src/lib/providers'

interface ProviderCheck {
  kind: ProviderKind
  apiKey: string | undefined
  model: string
  baseURL?: string
}

const CHECKS: ProviderCheck[] = [
  {
    kind: 'sensenova', // 默认测试通道，放第一位便于快速验证
    apiKey: process.env.SENSENOVA_API_KEY,
    model: process.env.SENSENOVA_MODEL ?? 'deepseek-v4-flash',
  },
  {
    kind: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
  },
  {
    kind: 'glm',
    apiKey: process.env.GLM_API_KEY,
    model: process.env.GLM_MODEL ?? 'glm-5-turbo', // ping 用最便宜的 turbo，不用旗舰 glm-5.2
    baseURL: process.env.GLM_BASE_URL, // 默认走 Coding Plan，env 可覆盖
  },
]

function formatResult(kind: ProviderKind, result: PingResult): string {
  const status = result.ok ? 'OK' : 'FAIL'
  const latency = `${result.latencyMs}ms`
  const message = result.message ?? ''
  return `[${kind.padEnd(10)}] ${status.padEnd(4)} ${latency.padStart(7)}  ${message}`
}

async function main(): Promise<void> {
  console.log('=== AI Learning Compiler — Provider Ping ===\n')

  const checks = CHECKS.filter((c) => isSupportedProvider(c.kind))

  if (checks.every((c) => !c.apiKey)) {
    console.log('未检测到任何 API Key，全部 skip。')
    console.log('')
    console.log('配置方法：')
    console.log('  1. 复制 .env.example 为 .env.local')
    console.log('  2. 填入 SENSENOVA_API_KEY / DEEPSEEK_API_KEY / GLM_API_KEY 至少一项')
    console.log('  3. 重新运行 bun --env-file=.env.local run scripts/ping.ts')
    process.exit(0)
  }

  const results: Array<{ kind: ProviderKind; result: PingResult }> = []

  for (const check of checks) {
    if (!check.apiKey) {
      console.log(`[${check.kind.padEnd(8)}] SKIP  (no API key)`)
      continue
    }

    const config: LLMConfig = {
      provider: check.kind,
      apiKey: check.apiKey,
      model: check.model,
      ...(check.baseURL ? { baseURL: check.baseURL } : {}),
    }

    try {
      const provider = createProvider(config)
      const result = await provider.ping()
      console.log(formatResult(check.kind, result))
      results.push({ kind: check.kind, result })
    } catch (e) {
      const result: PingResult = {
        ok: false,
        latencyMs: 0,
        message: e instanceof Error ? e.message : String(e),
      }
      console.log(formatResult(check.kind, result))
      results.push({ kind: check.kind, result })
    }
  }

  console.log('')
  const allOk = results.every((r) => r.result.ok)
  const anyChecked = results.length > 0
  if (anyChecked && allOk) {
    console.log('All checked providers are healthy.')
    process.exit(0)
  } else if (anyChecked) {
    console.log('Some providers failed — see output above.')
    process.exit(1)
  } else {
    console.log('No providers were checked.')
    process.exit(0)
  }
}

main().catch((e) => {
  console.error('Ping script crashed:', e)
  process.exit(2)
})
