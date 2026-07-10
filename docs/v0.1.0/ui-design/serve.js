/*
 * Minimal static file server for Phase 1 visual review.
 *
 * Usage:
 *   node docs/ui-design/serve.js              # default port 8765
 *   node docs/ui-design/serve.js 9000         # custom port
 *
 * Then open:
 *   http://localhost:8765/components.html
 *
 * Why a custom server instead of `python -m http.server`?
 *   - Per CLAUDE.md: avoid running python directly in this project.
 *   - Node is already available; zero external deps.
 *   - Adds correct MIME types for .css / .js / .woff2.
 *
 * Press Ctrl+C to stop.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = parseInt(process.argv[2] || '8765', 10)
const ROOT = __dirname

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0])
  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath)

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`404 Not Found: ${urlPath}`)
      console.log(`  404  ${urlPath}`)
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    const mime = MIME[ext] || 'application/octet-stream'

    res.writeHead(200, { 'Content-Type': mime })
    fs.createReadStream(filePath).pipe(res)
    console.log(`  200  ${urlPath}  (${mime})`)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('')
  console.log('  AI Learning Compiler · Phase 2 Prototype Server')
  console.log('  ────────────────────────────────────────────────────')
  console.log(`  Root:   ${ROOT}`)
  console.log(`  URL:    http://localhost:${PORT}/`)
  console.log(`  Index:  http://localhost:${PORT}/index.html`)
  console.log(`  Phase1: http://localhost:${PORT}/components.html`)
  console.log(`  Press Ctrl+C to stop.`)
  console.log('')
})
