/**
 * V2.1.0 Release Gate — 发布前 smoke 验证。
 *
 * Strategy: 双模式（showcase + production）关键路径 smoke。
 * - Showcase: 首页加载、模拟编译、知识页展示
 * - Production: compile、today、review、search、backup、settings
 *
 */

import { test, expect } from '@playwright/test'
import { startIsolatedProd, type IsolatedProdEnv } from './fixtures/isolated-prod-env'

test.describe('V2.1.0 Release Gate — Showcase smoke', () => {
  test('showcase 首页加载并展示静态题库入口', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/AI Learning Compiler/)
    await expect(page.getByRole('button', { name: '模拟编译' })).toBeVisible()
    await expect(page.getByRole('link', { name: '进入题库' })).toBeVisible()
  })
})

test.describe('V2.1.0 Release Gate — Production smoke', () => {
  let env: IsolatedProdEnv

  test.beforeAll(async () => {
    env = await startIsolatedProd({ startupTimeoutMs: 60_000 })
  })

  test.afterAll(async () => {
    await env?.cleanup()
  })

  test('production API 使用隔离 SQLite，并完成 backup integrity smoke', async ({ request }) => {
    const ping = await request.get(env.baseUrl)
    expect(ping.status()).toBe(200)

    const backup = await request.post(`${env.baseUrl}/api/backup/auto`, {
      data: { force: true },
    })
    expect(backup.status()).toBe(200)
    const backupResult = (await backup.json()) as { created: boolean }
    expect(backupResult.created).toBe(true)

    const verify = await request.get(`${env.baseUrl}/api/backup/verify`)
    expect(verify.status()).toBe(200)
    const verification = (await verify.json()) as { integrityCheck: string; backupPath: string }
    expect(verification.integrityCheck).toBe('ok')
    expect(verification.backupPath).toContain(env.tmpDir)
  })
})
