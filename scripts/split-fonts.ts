/**
 * split-fonts.ts -- Source Han Serif SC font subsetting via cn-font-split
 *
 * Splits the large (~17MB) Source Han Serif SC font into on-demand woff2 chunks
 * so only visible characters load on first screen (<2MB target).
 *
 * Usage:
 *   bun run scripts/split-fonts.ts
 *
 * Prerequisites:
 *   Place the source font file in public/fonts/source-han-serif-sc/source/
 *   See public/fonts/README.md for download instructions.
 */

import { fontSplit } from 'cn-font-split'
import { existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const FONT_DIR = resolve(ROOT, 'public/fonts/source-han-serif-sc')
const SOURCE_DIR = resolve(FONT_DIR, 'source')
const OUTPUT_DIR = FONT_DIR

// Supported source file names (OTF preferred for CJK quality)
const CANDIDATE_FILES = [
  'SourceHanSerifSC-Regular.otf',
  'SourceHanSerifSC-Regular.ttf',
  'SourceHanSerifCN-Regular.otf',
  'SourceHanSerifCN-Regular.ttf',
]

function findSourceFont(): string | null {
  for (const name of CANDIDATE_FILES) {
    const p = resolve(SOURCE_DIR, name)
    if (existsSync(p)) return p
  }
  return null
}

async function main(): Promise<void> {
  const sourcePath = findSourceFont()

  if (!sourcePath) {
    console.error('[split-fonts] Source font file not found.')
    console.error('')
    console.error('Place one of the following files in public/fonts/source-han-serif-sc/source/:')
    for (const name of CANDIDATE_FILES) {
      console.error(`  - ${name}`)
    }
    console.error('')
    console.error('Download from: https://github.com/adobe-fonts/source-han-serif/releases')
    console.error('  File: SourceHanSerifSC.zip -> extract SourceHanSerifSC-Regular.otf')
    process.exit(1)
  }

  console.error(`[split-fonts] Using source: ${sourcePath}`)

  mkdirSync(OUTPUT_DIR, { recursive: true })

  const inputBuffer = new Uint8Array(await Bun.file(sourcePath).arrayBuffer())

  console.error('[split-fonts] Splitting font (this may take a moment)...')

  await fontSplit({
    input: inputBuffer,
    outDir: OUTPUT_DIR,
    css: {
      fontFamily: 'Source Han Serif SC',
      fontWeight: '400',
      fontStyle: 'normal',
      fontDisplay: 'swap',
      localFamily: ['Source Han Serif SC', 'Noto Serif SC', 'Songti SC'],
      compress: true,
    },
    previewImage: {
      name: 'preview',
      text: 'AI Learning Compiler',
    },
    testHtml: false,
    reporter: false,
    silent: false,
  })

  console.error(`[split-fonts] Done. Output: ${OUTPUT_DIR}`)
  console.error('[split-fonts] Import result.css in globals.css to activate.')
}

main().catch((err: unknown) => {
  console.error('[split-fonts] Fatal error:', err)
  process.exit(1)
})
