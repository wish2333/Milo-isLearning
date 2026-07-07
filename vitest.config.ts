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
