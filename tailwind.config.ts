import type { Config } from 'tailwindcss'

/**
 * Tailwind CSS 配置（M7.5 token 暴露）
 *
 * 把 globals.css 中的 CSS 变量暴露成 Tailwind 颜色 token，
 * 让组件可以用 `bg-bg-base`、`text-fg-primary`、`border-border-subtle` 等
 * 而不必每次写裸 `var(--bg-base)`。
 */
const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
        },
        fg: {
          primary: 'var(--fg-primary)',
          secondary: 'var(--fg-secondary)',
          tertiary: 'var(--fg-tertiary)',
        },
        accent: {
          primary: 'var(--accent-primary)',
          'primary-soft': 'var(--accent-primary-soft)',
        },
        success: {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          soft: 'var(--danger-soft)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
        },
      },
      fontFamily: {
        serif: 'var(--font-serif)',
        mono: 'var(--font-mono)',
        sans: 'var(--font-sans)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
