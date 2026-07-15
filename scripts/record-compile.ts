/**
 * Compile Recording Script -- records a real LLM compile session to JSON
 *
 * Wraps compileMarkdown() async generator, recording each yielded event
 * plus the delay between consecutive events. Output is a CompileRecording
 * JSON file that showcase mode can replay via loadRecordedEvents().
 *
 * Usage:
 *   bun --env-file=.env.local run scripts/record-compile.ts \
 *     --input "Markdown content or topic name" \
 *     --output public/showcase-modules/recordings/my-topic.compile-recording.json \
 *     [--provider deepseek] \
 *     [--model deepseek-v4-flash]
 *
 * Alternatively, read markdown from a file:
 *   bun --env-file=.env.local run scripts/record-compile.ts \
 *     --input-file path/to/source.md \
 *     --output public/showcase-modules/recordings/my-topic.compile-recording.json
 *
 * Env (loaded via bun --env-file):
 *   DEEPSEEK_API_KEY / GLM_API_KEY / OPENAI_COMPAT_API_KEY
 *
 * Recording file size should stay under 5MB. If the input markdown produces
 * a very large Module (many concepts + quizzes), consider trimming the input.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { compileMarkdown } from '../src/lib/compiler/pipeline'
import type { CompileEvent, CompileConfig } from '../src/lib/compiler/pipeline/types'
import { isSupportedProvider } from '../src/lib/providers'
import type { LLMConfig, ProviderKind } from '../src/lib/providers'

// =================================================================
// Types
// =================================================================

/** Recorded compile session, replayed by showcase mode */
export interface CompileRecording {
  input: { markdown: string; config: CompileConfig }
  events: Array<{ event: CompileEvent; delayMs: number }>
  recordedAt: number
  provider: string
  model: string
}

interface CliArgs {
  input?: string
  inputFile?: string
  output: string
  provider: ProviderKind
  model: string
}

// =================================================================
// Constants
// =================================================================

const DEFAULT_PROVIDER: ProviderKind = 'deepseek'
const DEFAULT_MODEL = 'deepseek-v4-flash'
const RECORDING_SIZE_LIMIT_BYTES = 5 * 1024 * 1024 // 5MB

// =================================================================
// CLI
// =================================================================

function printUsageAndExit(): never {
  console.error(
    [
      'Usage: bun run scripts/record-compile.ts --output <path> [--input <text>] [--input-file <path>] [--provider <p>] [--model <m>]',
      '',
      '  --input       Markdown text or topic name to compile (mutually exclusive with --input-file)',
      '  --input-file  Path to a .md file to compile (mutually exclusive with --input)',
      '  --output      Output path for the recording JSON (required)',
      '  --provider    deepseek | glm | openai-compat  (default: deepseek)',
      '  --model       model ID  (default: deepseek-v4-flash)',
    ].join('\n'),
  )
  process.exit(2)
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = {
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? ''
    const next = argv[i + 1]
    switch (a) {
      case '--input':
        out.input = next
        i++
        break
      case '--input-file':
        out.inputFile = next
        i++
        break
      case '--output':
        out.output = next
        i++
        break
      case '--provider':
        out.provider = next as ProviderKind
        i++
        break
      case '--model':
        out.model = next
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
  if (!out.input && !out.inputFile) {
    console.error('Either --input or --input-file is required')
    process.exit(2)
  }
  if (out.input && out.inputFile) {
    console.error('--input and --input-file are mutually exclusive')
    process.exit(2)
  }
  if (!out.output) {
    console.error('--output is required')
    process.exit(2)
  }
  if (!out.provider || !isSupportedProvider(out.provider)) {
    console.error('--provider invalid (valid: deepseek | glm | openai-compat)')
    process.exit(2)
  }
  if (!out.model) {
    console.error('--model is required')
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
    enableThinking: false,
  }
}

// =================================================================
// Record
// =================================================================

async function recordCompile(
  markdown: string,
  config: CompileConfig,
  provider: string,
  model: string,
): Promise<CompileRecording> {
  const stream = compileMarkdown(markdown, config)
  const events: Array<{ event: CompileEvent; delayMs: number }> = []
  let lastEventTime = Date.now()
  let eventCount = 0
  let hasError = false

  for await (const event of stream) {
    const now = Date.now()
    const delayMs = events.length === 0 ? 0 : now - lastEventTime
    lastEventTime = now

    events.push({ event, delayMs })
    eventCount++

    if (event.kind === 'stage_enter') {
      console.info(`  [${event.stage}] enter`)
    } else if (event.kind === 'progress') {
      console.info(
        `  [${event.stage}] ${event.percent}%${event.message ? ` ${event.message}` : ''}`,
      )
    } else if (event.kind === 'complete') {
      console.info(`  [complete] module received (${event.module.concepts.length} concepts)`)
    } else if (event.kind === 'error') {
      hasError = true
      console.error(`  [error] ${event.error.code} @ ${event.error.stage}: ${event.error.message}`)
    }
  }

  if (hasError) {
    console.warn(`Recording completed with ${eventCount} events (last event was an error)`)
  } else {
    console.info(`Recording completed: ${eventCount} events`)
  }

  return {
    input: { markdown, config },
    events,
    recordedAt: Date.now(),
    provider,
    model,
  }
}

// =================================================================
// Main
// =================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  // Resolve input markdown
  let markdown: string
  if (args.inputFile) {
    try {
      markdown = await readFile(args.inputFile, 'utf-8')
    } catch {
      console.error(`Cannot read input file: ${args.inputFile}`)
      process.exit(2)
    }
    console.info(`Input: file ${args.inputFile} (${markdown.length} chars)`)
  } else {
    markdown = args.input!
    console.info(`Input: ${markdown.length} chars`)
  }

  const llm = buildLLMConfig(args)
  const config = buildCompileConfig(args, llm)

  console.info(`Provider: ${args.provider}`)
  console.info(`Model: ${args.model}`)
  console.info('Recording compile session...')
  console.info('')

  const recording = await recordCompile(markdown, config, args.provider, args.model)

  // Serialize and check size
  const json = JSON.stringify(recording, null, 2)
  const sizeBytes = Buffer.byteLength(json, 'utf-8')

  if (sizeBytes > RECORDING_SIZE_LIMIT_BYTES) {
    console.warn(
      `Recording size ${Math.round(sizeBytes / 1024)}KB exceeds 5MB limit. Consider trimming input.`,
    )
  }

  // Ensure output directory exists
  const outputDir = path.dirname(args.output)
  await mkdir(outputDir, { recursive: true })

  // Write recording
  await writeFile(args.output, json, 'utf-8')
  console.info('')
  console.info(`Recording written to: ${args.output}`)
  console.info(`Size: ${Math.round(sizeBytes / 1024)}KB`)
  console.info(`Events: ${recording.events.length}`)

  // Exit code: 0 even on compile error (recording is still valid for replay)
  process.exit(0)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
