// ESLint flat config — M2.5 W6 质量门禁
//
// 设计：
//   - 基于 next/core-web-vitals + next/typescript 推荐规则
//   - strict ts：禁止 `any`、未使用变量、隐式 return
//   - 与 .prettierrc 共存：本文件只负责代码质量，排版交给 prettier
//
// 对应：docs/M2.5-Plan.md §2.W6

import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: {},
  allConfig: {},
})

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      '.next-*/**',
      'node_modules/**',
      'dist/**',
      'build/**',
      'out/**',
      'coverage/**',
      'references/**',
      'reports/**',
      '__recordings__/**',
      'next-env.d.ts',
      'tsconfig.tsbuildinfo',
      '**/*.tsbuildinfo',
      // 第三方 markdown / json 内容不参与 lint
      'docs/**',
      'src/lib/compiler/prompts/**/*.md',
      'src/lib/compiler/__fixtures__/**',
      // Next.js 脚手架自动生成的配置文件（require / 匿名默认导出）
      'postcss.config.mjs',
      'tailwind.config.ts',
      'next.config.ts',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // ===== TypeScript 严格性 =====
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // ===== 代码质量 =====
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      // ===== React / Next.js =====
      'react/jsx-key': 'error',
      'react/no-array-index-key': 'warn',
      // ===== 排版交给 prettier，eslint 不重复 =====
      // （未引入 eslint-plugin-prettier，避免双重排版冲突）
    },
  },
  {
    // 测试文件：允许 console 与稍微放宽的 any
    files: ['**/__tests__/**/*.ts', '**/__tests__/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  {
    // 脚本目录：CLI 工具允许 console
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]

export default eslintConfig
