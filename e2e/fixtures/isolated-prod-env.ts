/**
 * 隔离 production 环境启动 helper（V2.1.0 P0.1）
 *
 * 用于 E2E 测试与手动验证矩阵，避免污染真实 data/alc.db。
 * 通过 ALC_DB_PATH 指向临时目录的 SQLite 文件。
 *
 * 使用方式（Playwright beforeAll/afterAll）：
 *   let env: IsolatedProdEnv
 *   test.beforeAll(async () => { env = await startIsolatedProd() })
 *   test.afterAll(async () => { await env.cleanup() })
 *
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface IsolatedProdEnv {
  /** 临时 SQLite 文件绝对路径 */
  dbPath: string
  /** 临时目录绝对路径（afterAll 清理用） */
  tmpDir: string
  /** Server 基础 URL，如 http://localhost:3456 */
  baseUrl: string
  /** 清理函数：kill child + 删 tmpDir */
  cleanup: () => Promise<void>
}

export interface StartIsolatedProdOptions {
  /** 自定义端口；默认 0 = 自动分配空闲端口 */
  port?: number
  /** 启动模式：'dev'（bun run dev）或 'start'（bun run start，需要先 build） */
  mode?: 'dev' | 'start'
  /** 启动超时（ms），默认 30s */
  startupTimeoutMs?: number
}

async function findFreePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (port === 0) throw new Error('无法分配隔离 production server 端口')
  return port
}

async function waitForServerReady(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = '未知错误'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.status === 200) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`隔离 production server 启动超时：${lastError}`)
}

/**
 * 启动隔离的 production server 实例。
 *
 * 注意：preview server 需要先 `bun run build` 生成 .next 目录。
 */
export async function startIsolatedProd(
  options: StartIsolatedProdOptions = {},
): Promise<IsolatedProdEnv> {
  const port = options.port && options.port > 0 ? options.port : await findFreePort()
  const startupTimeoutMs = options.startupTimeoutMs ?? 30_000
  const mode = options.mode ?? 'dev'

  // 1. 临时目录
  const tmpDir = mkdtempSync(join(tmpdir(), 'alc-e2e-'))
  const dbPath = join(tmpDir, 'alc-test.db')

  const cacheDir = `.next-p0-${port}`
  const env = {
    ...process.env,
    NEXT_PUBLIC_APP_MODE: 'production',
    ALC_STORAGE_BACKEND: 'sqlite',
    ALC_DB_PATH: dbPath,
    ALC_BACKUP_DIR: join(tmpDir, 'backup'),
    PORT: String(port),
    E2E_CACHE_DIR: cacheDir,
  }
  const args = mode === 'start' ? ['run', 'start'] : ['run', 'dev']
  const child: ChildProcess = spawn('bun', args, {
    cwd: process.cwd(),
    env,
    stdio: 'ignore',
  })

  try {
    await waitForServerReady(`http://localhost:${port}`, startupTimeoutMs)
  } catch (error) {
    child.kill('SIGTERM')
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
    throw error
  }

  return {
    dbPath,
    tmpDir,
    baseUrl: `http://localhost:${port}`,
    cleanup: async () => {
      if (child) {
        child.kill('SIGTERM')
        await new Promise<void>((resolve) => {
          child.on('exit', () => resolve())
          setTimeout(() => {
            child.kill('SIGKILL')
            resolve()
          }, 5000)
        })
      }
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true })
      }
      const cachePath = join(process.cwd(), cacheDir)
      if (existsSync(cachePath)) rmSync(cachePath, { recursive: true, force: true })
    },
  }
}
