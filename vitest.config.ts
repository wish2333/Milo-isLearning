import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * Vitest 配置
 *
 * - environment=node：Provider / Schema 测试不需要 DOM
 * - globals=false：强制显式 import { describe, it, expect }，避免污染全局
 * - unstubGlobals=true：每个测试后自动还原 vi.stubGlobal 的全局替换
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    unstubGlobals: true,
    // 全局 setup：提供 localStorage / sessionStorage stub。
    // v1.0.0 默认 showcase 模式下 store persist 走 LocalStorageRepository，
    // 在 Node 环境跑测试时需要 stub 避免抛 ReferenceError。
    // 个别测试如需特定行为可用 vi.stubGlobal 覆盖。
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.ts',
    ],
    exclude: ['node_modules', '.next', '.omo'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
