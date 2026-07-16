import sharp from 'sharp'
import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'

const svgPath = resolve('public/og-image.svg')
const pngPath = resolve('public/og-image.png')

const svgBuffer = readFileSync(svgPath)

await sharp(svgBuffer).resize(1200, 630).png().toFile(pngPath)

const meta = await sharp(pngPath).metadata()
const size = statSync(pngPath).size
console.info(
  `og-image.png: ${meta.width}x${meta.height}, ${size} bytes (${(size / 1024).toFixed(1)} KB)`,
)
