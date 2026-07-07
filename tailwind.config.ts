import type { Config } from 'tailwindcss'

/**
 * Tailwind CSS 配置（M1 最小骨架）
 * 视觉 token 在 M1 收尾后由 docs/ui-design/DESIGN-SPEC.md 第二章转换填入
 */
const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
