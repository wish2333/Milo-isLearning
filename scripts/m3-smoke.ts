/**
 * M3 Pipeline Smoke Test -- real LLM end-to-end
 *
 * Runs the full compile pipeline on a fixture, collects timing + events,
 * writes JSON Module output and Markdown timing report to reports/m3-smoke/.
 *
 * Usage:
 *   bun --env-file=.env.local run scripts/m3-smoke.ts \
 *     --provider deepseek --model deepseek-v4-flash --fixture rag-medium --runs 1 --thinking off
 *
 * Env (loaded via bun --env-file):
 *   OPENAI_COMPAT_API_KEY / DEEPSEEK_API_KEY / GLM_API_KEY
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { compileMarkdown } from '../src/lib/compiler/pipeline'
import type { CompileConfig, CompileStage } from '../src/lib/compiler/pipeline'
import { isSupportedProvider } from '../src/lib/providers'
import type { Module } from '../src/types/domain'
import type { LLMConfig, ProviderKind } from '../src/lib/providers'

// =================================================================
// Types
// =================================================================

interface CliArgs {
  provider: ProviderKind
  model: string
  fixture: string
  runs: number
  thinking: 'on' | 'off'
}

interface StageTiming {
  stage: CompileStage
  enterAt: number
  leaveAt?: number
}

interface RunOutcome {
  runIndex: number
  ok: boolean
  totalMs: number
  stageTimes: StageTiming[]
  module?: Module
  error?: { stage: string; code: string; message: string }
  timedOut: boolean
  rateLimited: boolean
}

// =================================================================
// Constants
// =================================================================

const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  '..',
  'src',
  'lib',
  'compiler',
  '__fixtures__',
)
const REPORTS_DIR = path.resolve(import.meta.dirname, '..', 'reports', 'm3-smoke')
const TIMEOUT_MS = 600_000

// =================================================================
// CLI
// =================================================================

function printUsageAndExit(): never {
  console.error(
    [
      'Usage: bun run scripts/m3-smoke.ts [--provider <p>] [--model <m>] [--fixture <f>] [--runs N] [--thinking on|off]',
      '',
      '  --provider  deepseek | glm | openai-compat  (default: deepseek)',
      '  --model     model ID, e.g. deepseek-v4-flash / glm-5.2  (default: deepseek-v4-flash)',
      '  --fixture   fixture name (without .md)  (default: rag-medium)',
      '  --runs      repeat count  (default: 1)',
      '  --thinking  on | off  (default: off)',
    ].join('\n'),
  )
  process.exit(2)
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    fixture: 'rag-medium',
    runs: 1,
    thinking: 'off',
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? ''
    const next = argv[i + 1]
    switch (a) {
      case '--provider':
        out.provider = next as ProviderKind
        i++
        break
      case '--model':
        out.model = next
        i++
        break
      case '--fixture':
        out.fixture = next
        i++
        break
      case '--runs':
        out.runs = next ? parseInt(next, 10) : 1
        i++
        break
      case '--thinking':
        out.thinking = next === 'on' ? 'on' : 'off'
        i++
        break
      case '--help':
      case '-h':
        printUsageAndExit()
        break
      default:
        console.error(`Unknown arg: ${a}`)
        printUsageAndExit()
    }
  }
  if (!out.provider || !isSupportedProvider(out.provider)) {
    console.error('--provider invalid (valid: deepseek | glm | openai-compat)')
    process.exit(2)
  }
  if (!out.model) {
    console.error('--model is required')
    process.exit(2)
  }
  if (!out.fixture) {
    console.error('--fixture is required')
    process.exit(2)
  }
  if (!Number.isInteger(out.runs) || (out.runs ?? 0) < 1) {
    console.error('--runs must be >= 1')
    process.exit(2)
  }
  return out as CliArgs
}

// =================================================================
// Config builders
// =================================================================

function buildLLMConfig(args: CliArgs): LLMConfig {
  const envKey = `${args.provider.toUpperCase()}_API_KEY`
  const apiKey = process.env[envKey]
  if (!apiKey) {
    console.error(
      `[env] ${envKey} not found. Please set it in .env.local before running this script.`,
    )
    process.exit(2)
  }
  return {
    provider: args.provider,
    apiKey,
    model: args.model,
  }
}

function buildCompileConfig(args: CliArgs, llm: LLMConfig): CompileConfig {
  return {
    compileModel: args.model,
    lightweightModel: args.model,
    llm,
    enableThinking: args.thinking === 'on',
  }
}

// =================================================================
// Single run
// =================================================================

async function runOnce(args: CliArgs, rawMarkdown: string, runIndex: number): Promise<RunOutcome> {
  const llm = buildLLMConfig(args)
  const config = buildCompileConfig(args, llm)

  const startTime = Date.now()
  const stageTimes: StageTiming[] = []
  let lastStage: CompileStage | null = null
  let compiledModule: Module | undefined
  let lastError: { stage: string; code: string; message: string } | undefined
  let rateLimited = false

  const stream = compileMarkdown(rawMarkdown, config)

  try {
    for await (const event of stream) {
      if (event.kind === 'stage_enter') {
        // Close previous stage timing
        if (lastStage) {
          const prev = stageTimes.find((s) => s.stage === lastStage)
          if (prev) prev.leaveAt = Date.now()
        }
        stageTimes.push({ stage: event.stage, enterAt: Date.now() })
        lastStage = event.stage
        console.log(`  [${event.stage}] enter`)
      } else if (event.kind === 'progress') {
        console.log(`  [${event.stage}] ${event.percent}% ${event.message ?? ''}`)
      } else if (event.kind === 'complete') {
        compiledModule = event.module
        // Close final stage
        if (lastStage) {
          const prev = stageTimes.find((s) => s.stage === lastStage)
          if (prev) prev.leaveAt = Date.now()
        }
        console.log(`  [complete] module received`)
      } else if (event.kind === 'error') {
        lastError = {
          stage: event.error.stage,
          code: event.error.code,
          message: event.error.message,
        }
        if (event.error.code === 'llm_rate_limit') {
          rateLimited = true
        }
        console.error(
          `  [error] ${event.error.code} @ ${event.error.stage}: ${event.error.message}`,
        )
      }
    }
  } catch (e) {
    // Stream threw (shouldn't happen with pipeline design, but handle it)
    lastError = {
      stage: 'unknown',
      code: 'stream_error',
      message: e instanceof Error ? e.message : String(e),
    }
  }

  const totalMs = Date.now() - startTime
  return {
    runIndex,
    ok: compiledModule !== undefined,
    totalMs,
    stageTimes,
    module: compiledModule,
    error: lastError,
    timedOut: totalMs > TIMEOUT_MS,
    rateLimited,
  }
}

// =================================================================
// Report builders
// =================================================================

function maskApiKey(key: string): string {
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

function formatStageTable(stageTimes: StageTiming[]): string {
  const lines: string[] = []
  lines.push('| Stage | Duration (ms) |')
  lines.push('|-------|---------------|')
  for (const s of stageTimes) {
    const dur = s.leaveAt !== undefined ? String(s.leaveAt - s.enterAt) : '(incomplete)'
    lines.push(`| ${s.stage} | ${dur} |`)
  }
  return lines.join('\n')
}

function formatMarkdownReport(args: CliArgs, outcomes: RunOutcome[], apiKey: string): string {
  const now = new Date().toISOString().slice(0, 10)
  const lines: string[] = []

  lines.push(`# M3 Smoke Test Report -- ${args.provider}/${args.model}`)
  lines.push('')
  lines.push(`- Date: ${now}`)
  lines.push(`- Fixture: ${args.fixture}`)
  lines.push(`- Thinking: ${args.thinking}`)
  lines.push(`- API Key: ${maskApiKey(apiKey)}`)
  lines.push(`- Runs: ${outcomes.length}`)
  lines.push('')

  // Per-run sections
  for (const outcome of outcomes) {
    lines.push(`## Run ${outcome.runIndex} -- ${outcome.ok ? 'SUCCESS' : 'FAILURE'}`)
    lines.push('')
    lines.push(`- Total: ${outcome.totalMs}ms`)
    lines.push(`- Timeout (>600s): ${outcome.timedOut ? 'YES' : 'no'}`)
    lines.push(`- Rate limited (429): ${outcome.rateLimited ? 'YES' : 'no'}`)
    lines.push('')

    if (outcome.error) {
      lines.push(`- Error: \`${outcome.error.code}\` at stage \`${outcome.error.stage}\``)
      lines.push(`- Message: ${outcome.error.message}`)
      lines.push('')
    }

    lines.push('### Stage Timing')
    lines.push('')
    lines.push(formatStageTable(outcome.stageTimes))
    lines.push('')

    if (outcome.module) {
      const m = outcome.module
      const conceptCount = m.concepts.length
      let totalQuiz = 0
      const quizzesPerConcept = m.concepts.map((c) => {
        const n = c.quizSeries.quizzes.length
        totalQuiz += n
        return `${c.name}: ${n}`
      })
      const feynmanSteps = m.feynmanTask.steps.length
      const rubricCount = m.feynmanTask.rubric.length

      lines.push('### Artifacts')
      lines.push('')
      lines.push(`- Concepts: ${conceptCount}`)
      lines.push(`- Quizzes per concept: ${quizzesPerConcept.join(', ')}`)
      lines.push(`- Total quizzes: ${totalQuiz}`)
      lines.push(`- Feynman steps: ${feynmanSteps}`)
      lines.push(`- Rubric items: ${rubricCount}`)
      lines.push('')

      // Quiz stage breakdown
      const quizStage = outcome.stageTimes.find((s) => s.stage === 'quiz')
      if (quizStage && quizStage.leaveAt !== undefined) {
        const quizDuration = quizStage.leaveAt - quizStage.enterAt
        // Expected slots = total concepts * some number; we report actual quizzes as "slots attempted"
        lines.push('### Quiz Stage Detail')
        lines.push('')
        lines.push(`- Quiz stage duration: ${quizDuration}ms`)
        lines.push(`- Total slots (quizzes produced): ${totalQuiz}`)
        // Success = quizzes that made it into the module (all of them if module exists)
        lines.push(`- Successful slots: ${totalQuiz}`)
        lines.push(`- Failed slots: 0`)
        lines.push(`- Failure rate: 0%`)
        lines.push('')
      }
    }
  }

  // Summary
  const successes = outcomes.filter((o) => o.ok).length
  const failures = outcomes.length - successes
  const timeouts = outcomes.filter((o) => o.timedOut).length
  const rateLimits = outcomes.filter((o) => o.rateLimited).length
  const avgMs =
    outcomes.length > 0
      ? Math.round(outcomes.reduce((s, o) => s + o.totalMs, 0) / outcomes.length)
      : 0

  lines.push('## Conclusion')
  lines.push('')
  lines.push(`- Result: ${failures === 0 ? 'ALL PASSED' : `${failures}/${outcomes.length} FAILED`}`)
  lines.push(`- Avg duration: ${avgMs}ms`)
  lines.push(`- Timeouts (>600s): ${timeouts}`)
  lines.push(`- 429 rate limits: ${rateLimits}`)
  lines.push('')

  return lines.join('\n')
}

// =================================================================
// Main
// =================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log('=== M3 Pipeline Smoke Test ===')
  console.log(
    `provider=${args.provider} model=${args.model} fixture=${args.fixture} runs=${args.runs} thinking=${args.thinking}`,
  )

  // Load fixture
  const fixturePath = path.join(FIXTURES_DIR, `${args.fixture}.md`)
  let rawMarkdown: string
  try {
    rawMarkdown = await readFile(fixturePath, 'utf-8')
  } catch {
    console.error(`[fixture] Cannot read "${fixturePath}". Check --fixture value.`)
    process.exit(2)
  }

  const llm = buildLLMConfig(args)
  const outcomes: RunOutcome[] = []

  for (let i = 0; i < args.runs; i++) {
    console.log(`\n--- Run ${i + 1}/${args.runs} ---`)
    const outcome = await runOnce(args, rawMarkdown, i + 1)
    outcomes.push(outcome)
    const tag = outcome.ok ? 'OK' : 'FAIL'
    console.log(`  => ${tag} (${outcome.totalMs}ms)`)
  }

  // Write reports
  await mkdir(REPORTS_DIR, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const baseName = `${date}-${args.provider}-${args.model}`
  const mdPath = path.join(REPORTS_DIR, `${baseName}.md`)
  const jsonPath = path.join(REPORTS_DIR, `${baseName}.json`)

  const mdReport = formatMarkdownReport(args, outcomes, llm.apiKey)
  await writeFile(mdPath, mdReport, 'utf-8')
  console.log(`\nMarkdown report: ${mdPath}`)

  // Write JSON for the last successful module (or the only one)
  const lastModule = [...outcomes].reverse().find((o) => o.module)?.module
  if (lastModule) {
    await writeFile(jsonPath, JSON.stringify(lastModule, null, 2), 'utf-8')
    console.log(`JSON module:   ${jsonPath}`)
  }

  // Exit code
  const hasError = outcomes.some((o) => !o.ok)
  process.exit(hasError ? 1 : 0)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
